include make/common.mk

.PHONY: start repl start-container test test-coverage migration-new migration-diff migration-hashes lint tool service-object-store

EPHEMERAL_DIR := .ephemeral

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

SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY ?= $(EPHEMERAL_DIR)/object-store
export SNAPSHOT_DEFER_OBJECT_STORE_BUCKET ?= snapshot-defer
export SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID ?= admin
export SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY ?= $(shell $(call secret,object-store-secret-access-key,aws-secret-access-key))
SNAPSHOT_DEFER_OBJECT_STORE_PORT_ADMIN ?= 23646
SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3 ?= 8333
export SNAPSHOT_DEFER_OBJECT_STORE_ENDPOINT ?= http://127.0.0.1:$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3)

secret = node --experimental-strip-types script/secret.ts --name '$(1)' --kind '$(2)'

start: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps --experimental-vm-modules $(SERVER_OUT_MAIN)

repl: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps --import='./$(SERVER_OUT_REPL)' $(NODE_ARGS) $(SCRIPT) $(SCRIPT_ARGS)

start-container:
	@:$(call check_defined, EXTERNAL_AUTHORITY)

	docker run --rm -it -p '$(CONTAINER_PORT):3000' \
		-v '$(CONTAINER_VOLUME):$(CONTAINER_DATABASE_DIRECTORY)' \
		-e HOST='0.0.0.0' \
		-e DATABASE_PATH='$(CONTAINER_DATABASE_PATH)' \
		-e EXTERNAL_AUTHORITY='$(EXTERNAL_AUTHORITY)' \
		-e SIGNING_VOUCHER='$(shell $(call secret,voucher,signing-key))' \
		-e SNAPSHOT_DEFER_OBJECT_STORE_BUCKET='none' \
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
		$(if $(TEST_NAME_PATTERN),--test-name-pattern='$(TEST_NAME_PATTERN)',) \
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

$(EPHEMERAL_DIR):
	mkdir $(EPHEMERAL_DIR)

$(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY): | $(EPHEMERAL_DIR)
	mkdir $(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)

# uses locally installed SeeweedFS (https://github.com/seaweedfs/seaweedfs)
service-object-store: | $(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)
	@ \
		until echo "s3.bucket.create -name $(SNAPSHOT_DEFER_OBJECT_STORE_BUCKET) -owner $(SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID)" | weed shell; \
			do sleep 2; \
		done & \
		AWS_ACCESS_KEY_ID='$(SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID)' AWS_SECRET_ACCESS_KEY='$(SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY)' weed mini \
			-dir='$(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)' \
			-admin.password='$(SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY)' \
			-admin.port='$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_ADMIN)' \
			-s3.port='$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3)' \
			-webdav='false'
