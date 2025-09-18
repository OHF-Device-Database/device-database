include make/common.mk

.PHONY: start start-container test test-coverage migration-new migration-diff migration-hashes lint

MIGRATION_DIR := src/service/database/migration
MIGRATIONS := $(wildcard $(MIGRATION_DIR)/*.sql)

MIGRATION_FORMAT := %Y%m%d%H%M%S

TOOL_BUILD_OUT_MAIN := out/tool/sqlite-diff.mjs
TOOL_BUILD_OUT := $(TOOL_BUILD_OUT_MAIN)

start: build
	@node --enable-source-maps $(SERVER_BUILD_OUT_MAIN)

start-container:
	docker run --rm -it -p "3030:3000" '$(IMAGE_TAG):latest'

test: query
	@node_modules/.bin/tap \
		--node-arg='--no-warnings=ExperimentalWarning' \
		--node-arg='--enable-source-maps' \
		--node-arg='--experimental-specifier-resolution=node' \
		$(UNIT)

test-coverage:
	@node_modules/.bin/tap report html

migration-new:
	@touch '$(MIGRATION_DIR)/$(shell date +'$(MIGRATION_FORMAT)').sql'

$(subst .,%,$(TOOL_BUILD_OUT)): $(SERVER_BUILD_IN)
	@npm exec -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/tool.ts

migration-diff: $(TOOL_BUILD_OUT)
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MAIN) \
		--schema src/service/database/schema.sql \
		--migration-directory src/service/database/migration

migration-hashes:
	@$(foreach file, $(MIGRATIONS), printf '$(notdir $(file)) | '; { printf '$(notdir $(file))'; cat '$(file)'; } | sha1sum | awk '{ print $$1 }';)

lint:
	npm exec -- biome lint
	$(MAKE) migration-diff
