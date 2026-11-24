include make/common.mk

.PHONY: start repl start-container test test-coverage migration-new migration-diff migration-lint lint tool service-object-store index-seed-github index-seed-dcl index-export

EPHEMERAL_DIR := .ephemeral

MIGRATION_DIR := src/service/database/migration
MIGRATIONS := $(wildcard $(MIGRATION_DIR)/*.sql)

MIGRATION_FORMAT := %Y%m%d%H%M%S
MIGRATION_DATABASE ?= staging

TOOL_BUILD_OUT_MIGRATION_DIFF := out/tool/migration-diff.mjs
TOOL_BUILD_OUT_MIGRATION_LINT := out/tool/migration-lint.mjs
TOOL_BUILD_OUT_MIGRATION_TABLE_DML := out/tool/migration-table-dml.mjs
TOOL_BUILD_OUT_DATABASE_QUERY_DEBUG := out/tool/database-query-debug.mjs
TOOL_BUILD_OUT_INDEX_SEED_GITHUB := out/tool/index-seed-github.mjs
TOOL_BUILD_OUT_INDEX_SEED_DCL := out/tool/index-seed-dcl.mjs
TOOL_BUILD_OUT_INDEX_EXPORT := out/tool/index-export.mjs
TOOL_BUILD_OUT_WORKER_DATABASE := out/tool/worker-database.mjs
TOOL_BUILD_OUT := $(TOOL_BUILD_OUT_MIGRATION_DIFF) $(TOOL_BUILD_OUT_MIGRATION_LINT) $(TOOL_BUILD_OUT_MIGRATION_TABLE_DML) $(TOOL_BUILD_OUT_DATABASE_QUERY_DEBUG) $(TOOL_BUILD_OUT_INDEX_SEED_GITHUB) $(TOOL_BUILD_OUT_INDEX_SEED_DCL) $(TOOL_BUILD_OUT_INDEX_EXPORT) $(TOOL_BUILD_OUT_WORKER_DATABASE)

CONTAINER_PORT ?= 3030
CONTAINER_VOLUME ?= device-database-data
CONTAINER_DATABASE_DIRECTORY ?= /volume
CONTAINER_DATABASE_DOMAIN_STAGING ?= $(CONTAINER_DATABASE_DIRECTORY)/staging
CONTAINER_DATABASE_DOMAIN_DERIVED ?= $(CONTAINER_DATABASE_DIRECTORY)/derived
CONTAINER_DATABASE_DOMAIN_INDEX ?= $(CONTAINER_DATABASE_DIRECTORY)/index

SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY ?= $(EPHEMERAL_DIR)/object-store
export SNAPSHOT_DEFER_OBJECT_STORE_BUCKET ?= snapshot-defer
export SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID ?= admin
export SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY ?= $(shell $(call secret,object-store-secret-access-key,aws-secret-access-key))
SNAPSHOT_DEFER_OBJECT_STORE_PORT_ADMIN ?= 23646
SNAPSHOT_DEFER_OBJECT_STORE_PORT_MASTER ?= 9333
SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3 ?= 8333
export SNAPSHOT_DEFER_OBJECT_STORE_ENDPOINT ?= http://127.0.0.1:$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3)

secret = node --experimental-strip-types script/secret.ts --name '$(1)' --kind '$(2)'

export NODE_OPTIONS ?= "--disable-warning=ExperimentalWarning"
NODE_ENTRYPOINT ?= default

start: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps $(SERVER_OUT_MAIN)

start-nest: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps $(SERVER_OUT_MAIN_NEST)

repl: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		node --enable-source-maps --import='./$(SERVER_OUT_REPL)' $(NODE_ARGS) $(SCRIPT) $(SCRIPT_ARGS)

repl-nest: build
	@ \
		SIGNING_VOUCHER=$(shell $(call secret,voucher,signing-key)) \
		SCHEDULER_ENABLE='false' \
		node --enable-source-maps $(SERVER_OUT_REPL_NEST)

start-container:
	@:$(call check_defined, EXTERNAL_AUTHORITY)

	docker run --rm -it -p '$(CONTAINER_PORT):3000' \
		-v '$(CONTAINER_VOLUME):$(CONTAINER_DATABASE_DIRECTORY)' \
		-e HOST='0.0.0.0' \
		-e DATABASE_DOMAIN_STAGING_PATH='$(CONTAINER_DATABASE_DOMAIN_STAGING)' \
		-e DATABASE_DOMAIN_DERIVED_PATH='$(CONTAINER_DATABASE_DOMAIN_DERIVED)' \
		-e DATABASE_DOMAIN_INDEX_PATH='$(CONTAINER_DATABASE_DOMAIN_INDEX)' \
		-e INITIALLY_CONCURRENT='true' \
		-e NODE_OPTIONS='$(NODE_OPTIONS)' \
		-e NODE_ENTRYPOINT='$(NODE_ENTRYPOINT)' \
		-e EXTERNAL_AUTHORITY='$(EXTERNAL_AUTHORITY)' \
		-e SIGNING_VOUCHER='$(shell $(call secret,voucher,signing-key))' \
		-e SNAPSHOT_DEFER_OBJECT_STORE_BUCKET='none' \
		'$(IMAGE_TAG):latest'

test: build query
	@node --test \
		--import tsx \
		--enable-source-maps \
		--experimental-test-module-mocks \
		--experimental-test-coverage \
		--experimental-test-snapshots \
		--test-coverage-exclude "src/service/database/query/**/*.ts" \
		--test-coverage-exclude "src/**/*.test.ts" \
		--no-warnings=ExperimentalWarning \
		$(if $(TEST_NAME_PATTERN),--test-name-pattern='$(TEST_NAME_PATTERN)',) \
		$(if $(TEST_SNAPSHOT),--test-update-snapshots,) $(UNIT)

migration-new:
	@touch '$(MIGRATION_DIR)/$(MIGRATION_DATABASE)/$(shell date +'$(MIGRATION_FORMAT)').sql'

$(subst .,%,$(TOOL_BUILD_OUT)): $(SERVER_IN)
	@pnpm exec tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/tool.ts

migration-diff: $(TOOL_BUILD_OUT)
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_DIFF) \
		--schema-directory src/service/database/schema/derived \
		--migration-directory src/service/database/migration/derived
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_DIFF) \
		--schema-directory src/service/database/schema/staging \
		--migration-directory src/service/database/migration/staging
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_DIFF) \
		--schema-directory src/service/database/schema/index \
		--migration-directory src/service/database/migration/index

migration-lint: $(TOOL_BUILD_OUT)
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_LINT) \
		--migration-directory src/service/database/migration/derived
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_LINT) \
		--migration-directory src/service/database/migration/staging
	@node --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_MIGRATION_LINT) \
		--migration-directory src/service/database/migration/index

lint:
	pnpm exec biome lint
	$(MAKE) migration-lint
	$(MAKE) migration-diff

tool: $(TOOL_BUILD_OUT)

# walks the repository at a respectful cadence into `INDEX_SEED_DATABASE`, resumes when present
index-seed-github: $(TOOL_BUILD_OUT)
	@:$(call check_defined, INDEX_SEED_DATABASE INDEX_GITHUB_OWNER INDEX_GITHUB_REPOSITORY)
	@node --enable-source-maps --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_INDEX_SEED_GITHUB) \
		--owner '$(INDEX_GITHUB_OWNER)' \
		--repository '$(INDEX_GITHUB_REPOSITORY)' \
		--branch '$(or $(INDEX_GITHUB_BRANCH),main)' \
		--interval '$(or $(INDEX_SEED_INTERVAL),1000)' \
		--database '$(INDEX_SEED_DATABASE)'

# walks the ledger at a respectful cadence into `INDEX_SEED_DATABASE`, updates from its ledger height when present
index-seed-dcl: $(TOOL_BUILD_OUT)
	@:$(call check_defined, INDEX_SEED_DATABASE)
	@node --enable-source-maps --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_INDEX_SEED_DCL) \
		--interval '$(or $(INDEX_SEED_INTERVAL),500)' \
		--database '$(INDEX_SEED_DATABASE)'

# writes derived devices not indexed yet as repository tree into `INDEX_EXPORT_OUTPUT`, nothing counts as indexed without `INDEX_EXPORT_INDEX`
index-export: $(TOOL_BUILD_OUT)
	@:$(call check_defined, INDEX_EXPORT_DERIVED INDEX_EXPORT_OUTPUT)
	@node --enable-source-maps --no-warnings=ExperimentalWarning $(TOOL_BUILD_OUT_INDEX_EXPORT) \
		--derived '$(INDEX_EXPORT_DERIVED)' \
		$(if $(INDEX_EXPORT_INDEX),--index '$(INDEX_EXPORT_INDEX)') \
		$(if $(filter true,$(INDEX_EXPORT_INCLUDE_INDEXED)),--include-indexed) \
		--output '$(INDEX_EXPORT_OUTPUT)'

$(EPHEMERAL_DIR):
	mkdir $(EPHEMERAL_DIR)

$(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY): | $(EPHEMERAL_DIR)
	mkdir $(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)

# uses locally installed SeeweedFS (https://github.com/seaweedfs/seaweedfs)
service-object-store: | $(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)
	@ \
		until echo "s3.bucket.create -name $(SNAPSHOT_DEFER_OBJECT_STORE_BUCKET) -owner $(SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID)" | weed shell -master 'localhost:$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_MASTER)'; \
			do sleep 2; \
		done & \
		AWS_ACCESS_KEY_ID='$(SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID)' AWS_SECRET_ACCESS_KEY='$(SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY)' weed mini \
			-dir='$(SNAPSHOT_DEFER_OBJECT_STORE_DIRECTORY)' \
			-admin.password='$(SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY)' \
			-admin.port='$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_ADMIN)' \
			-s3.port='$(SNAPSHOT_DEFER_OBJECT_STORE_PORT_S3)' \
			-webdav='false'
