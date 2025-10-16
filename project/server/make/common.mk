.PHONY: build query clean

CLIENT_IN := \
	$(shell find -L package/client/src -type f)

CLIENT_CSR_OUT := out/client-csr/entrypoint.js
CLIENT_SSR_OUT := out/client-ssr/entrypoint.mjs

SERVER_IN := \
	$(SERVER_QUERY_OUT) \
	$(shell find -L src -type f ! -path 'src/service/database/query/*.ts') \
	build/base.ts build/server.ts \
	tsconfig.json \
	$(realpath src/schema.ts)
SERVER_OUT_MAIN := out/server/main.mjs
SERVER_OUT_REPL := out/server/repl.mjs
SERVER_OUT := $(SERVER_OUT_MAIN)

SERVER_QUERY_QUERY_DIR := src/service/database/query
SERVER_QUERY_QUERY_IN := $(wildcard $(SERVER_QUERY_QUERY_DIR)/*.sql)
SERVER_QUERY_SCHEMA_IN := src/service/database/schema.sql
SERVER_QUERY_IN := $(SERVER_QUERY_QUERY_IN) $(SERVER_QUERY_SCHEMA_IN)
SERVER_QUERY_QUERY_OUT := $(patsubst %.sql,%.ts,$(SERVER_QUERY_QUERY_IN))
SERVER_QUERY_OUT := $(SERVER_QUERY_QUERY_OUT)

.PRECIOUS: $(SERVER_QUERY_OUT)

BUILD_OUT := $(SERVER_OUT) $(CLIENT_CSR_OUT) $(CLIENT_SSR_OUT)

IMAGE_TAG := ohf-device-database/device-database

# https://stackoverflow.com/a/10858332/4739690
check_defined = \
    $(strip $(foreach 1,$1, \
        $(call __check_defined,$1,$(strip $(value 2)))))
__check_defined = \
    $(if $(value $1),, \
      $(error undefined $1$(if $2, ($2))))

build: $(BUILD_OUT)

query: $(SERVER_QUERY_OUT)

# patterns can be used to define multi-output rules → replace least significant character
# with pattern wildcard symbol
$(subst .,%,$(SERVER_QUERY_QUERY_OUT)): $(SERVER_QUERY_QUERY_IN)
	@sqlc generate

$(subst .,%,$(SERVER_OUT)): $(SERVER_IN)
	@npm exec -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/server.ts

$(CLIENT_CSR_OUT): $(CLIENT_IN)
	@npm exec --prefix package/client -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/client-csr.ts

$(CLIENT_SSR_OUT): $(CLIENT_IN)
	@npm exec --prefix package/client -- tsc --project tsconfig.json --incremental --noEmit
	@node --experimental-strip-types --disable-warning=ExperimentalWarning build/client-ssr.ts

clean:
	$(RM) -r $(BUILD_OUT)
