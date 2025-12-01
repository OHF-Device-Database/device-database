include make/common.mk

.PHONY: start repl start-container test test-coverage migration-new migration-diff migration-hashes lint tool

MIGRATION_DIR := src/service/database/migration
MIGRATIONS := $(wildcard $(MIGRATION_DIR)/*.sql)

MIGRATION_FORMAT := %Y%m%d%H%M%S

TOOL_BUILD_OUT_MIGRATION_DIFF := out/tool/migration-diff.mjs
TOOL_BUILD_OUT := $(TOOL_BUILD_OUT_MIGRATION_DIFF)

CONTAINER_PORT ?= 3030
CONTAINER_VOLUME ?= device-database-data
CONTAINER_DATABASE_DIRECTORY ?= /volume
CONTAINER_DATABASE_PATH ?= $(CONTAINER_DATABASE_DIRECTORY)/server.db
CONTAINER_REPLICATION_TAG_PATH ?= $(CONTAINER_DATABASE_DIRECTORY)/replication-tag
CONTAINER_LITESTREAM_ENABLE ?= false

secret = node --experimental-strip-types script/secret.ts --name '$(1)' --kind '$(2)'

start: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps --experimental-vm-modules $(SERVER_OUT_MAIN)

repl: build
	@node --enable-source-maps --import='./$(SERVER_OUT_REPL)' $(NODE_ARGS) $(SCRIPT) $(SCRIPT_ARGS)

start-container:
	@:$(call check_defined, EXTERNAL_AUTHORITY)

	docker run --rm -it -p '$(CONTAINER_PORT):3000' \
		-v '$(CONTAINER_VOLUME):$(CONTAINER_DATABASE_DIRECTORY)' \
		-e HOST='0.0.0.0' \
		-e DATABASE_PATH='$(CONTAINER_DATABASE_PATH)' \
		-e EXTERNAL_AUTHORITY='$(EXTERNAL_AUTHORITY)' \
		-e SIGNING_VOUCHER='$(shell $(call secret,voucher,signing-key))' \
		-e LITESTREAM_ENABLE='$(CONTAINER_LITESTREAM_ENABLE)' \
		-e LITESTREAM_AWS_ACCESS_KEY_ID \
		-e LITESTREAM_AWS_SECRET_ACCESS_KEY \
		-e LITESTREAM_AWS_S3_PATH \
		-e REPLICATION_TAG_PATH='$(CONTAINER_REPLICATION_TAG_PATH)' \
		'$(IMAGE_TAG):latest'

test: build query
	@node --test \
		--import tsx \
		--enable-source-maps \
		--experimental-test-module-mocks \
		--experimental-test-coverage \
		--experimental-test-snapshots \
		--test-coverage-exclude "src/service/database/query/*.ts" \
		--test-coverage-exclude "src/**/*.test.ts" \
		--no-warnings=ExperimentalWarning \
		$(if $(TEST_SNAPSHOT),--test-update-snapshots,) $(UNIT)

migration-new:
	@touch '$(MIGRATION_DIR)/$(shell date +'$(MIGRATION_FORMAT)').sql'

$(subst .,%,$(TOOL_BUILD_OUT)): $(SERVER_IN)
	@npm exec -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/tool.ts

migration-diff: $(TOOL_BUILD_OUT)
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_DIFF) \
		--schema-directory src/service/database/schema \
		--migration-directory src/service/database/migration

migration-hashes:
	@$(foreach file, $(MIGRATIONS), printf '$(notdir $(file)) | '; { printf '$(notdir $(file))'; cat '$(file)'; } | sha1sum | awk '{ print $$1 }';)

lint:
	npm exec -- biome lint
	$(MAKE) migration-diff

tool: $(TOOL_BUILD_OUT)
