.PHONY: build clean

ALL := $(shell find -L src -type f)

SERVER_QUERY_QUERY_DIR := src/service/database/query
SERVER_QUERY_QUERY_IN := $(wildcard $(SERVER_QUERY_QUERY_DIR)/*.sql)
SERVER_QUERY_SCHEMA_IN := src/service/database/schema.sql
SERVER_QUERY_IN := $(SERVER_QUERY_QUERY_IN) $(SERVER_QUERY_SCHEMA_IN)
SERVER_QUERY_QUERY_OUT := $(patsubst %.sql,%.ts,$(SERVER_QUERY_QUERY_IN))
SERVER_QUERY_OUT := $(SERVER_QUERY_QUERY_OUT)

SERVER_BUILD_IN := \
	$(SERVER_QUERY_OUT) \
	$(shell find -L src -type f ! -path 'src/service/database/query/*.ts') \
	build/base.ts build/server.ts \
	tsconfig.json \
	$(realpath src/schema.ts)
SERVER_BUILD_OUT_MAIN := out/server/main.mjs
SERVER_BUILD_OUT_REPL := out/server/repl.mjs
SERVER_BUILD_OUT := $(SERVER_BUILD_OUT_MAIN)

.PRECIOUS: $(SERVER_QUERY_OUT)

BUILD_OUT := $(SERVER_BUILD_OUT)

IMAGE_TAG := ohf-device-database/device-database

# https://stackoverflow.com/a/10858332/4739690
check_defined = \
    $(strip $(foreach 1,$1, \
        $(call __check_defined,$1,$(strip $(value 2)))))
__check_defined = \
    $(if $(value $1),, \
      $(error Undefined $1$(if $2, ($2))))

build: $(BUILD_OUT)

query: $(SERVER_QUERY_OUT)

# patterns can be used to define multi-output rules → replace least significant character
# with pattern wildcard symbol
$(subst .,%,$(SERVER_QUERY_QUERY_OUT)): $(SERVER_QUERY_QUERY_IN)
	@sqlc generate

$(subst .,%,$(SERVER_BUILD_OUT)): $(SERVER_BUILD_IN)
	@npm exec -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/server.ts

clean:
	$(RM) -r $(BUILD_OUT)
