# can't use alpine because sqlc's wasm runtime doesn't work with musl
# https://github.com/bytecodealliance/wasmtime-go/issues/21

FROM node:24 AS schema-builder

WORKDIR /schema

COPY --from=schema package.json ./package.json
COPY --from=schema package-lock.json ./package-lock.json

RUN npm ci --verbose

COPY --from=schema . ./

RUN make build

FROM golang:1.25 AS sqlc-builder

WORKDIR /usr/src
RUN git clone --depth=1 https://github.com/OHF-Device-Database/sqlc.git
WORKDIR /usr/src/sqlc
RUN go build ./cmd/sqlc

FROM node:24 AS app-builder

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY --from=client package.json ./package/client/package.json
COPY --from=client package-lock.json ./package/client/package-lock.json

RUN npm ci --verbose

# `COPY` copies directory content, not the directory itself
COPY . ./
COPY --from=client . ./package/client

COPY --from=schema-builder /schema/out/schema.json src/
COPY --from=schema-builder /schema/out/typescript/schema.ts src/

COPY --from=sqlc-builder /usr/src/sqlc/sqlc /usr/bin/

COPY --from=sqlc-plugin plugin.wasm .

RUN	make SQLC_BIN='/usr/bin/sqlc' --file make/common.mk build

RUN npm prune --omit=dev

FROM node:24

COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/bin/

WORKDIR /app

COPY --from=app-builder /app/out/ ./out
COPY --from=app-builder /app/src/service/database/migration/ ./migration
COPY --from=app-builder /app/node_modules/ ./node_modules

COPY docker/entrypoint.sh /

CMD [ "/entrypoint.sh" ]
