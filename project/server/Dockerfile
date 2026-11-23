# build context is repository root (pnpm workspace)

FROM node:24 AS base

# keep in sync with `packageManager` in `/package.json`
RUN npm install --global pnpm@12.6.0

WORKDIR /repo

# only depends on the lockfile and workspace settings, so this layer stays cached until dependencies change
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY package.json ./

FROM base AS schema-builder

COPY schema/package.json ./schema/package.json

RUN pnpm install --offline --frozen-lockfile --filter schema

COPY schema/ ./schema/

RUN make --directory schema build

FROM base AS app-builder

COPY project/server/package.json ./project/server/package.json
COPY tool/sql-codegen/package.json ./tool/sql-codegen/package.json

# `server...` → `server` and the workspace packages it depends on (`sql-codegen`)
RUN pnpm install --offline --frozen-lockfile --filter 'server...'

# `COPY` copies directory content, not the directory itself
COPY tool/sql-codegen/src/ ./tool/sql-codegen/src/
COPY project/server/ ./project/server/

WORKDIR /repo/project/server

COPY --from=schema-builder /repo/schema/out/schema.json src/
COPY --from=schema-builder /repo/schema/out/typescript/schema.ts src/
COPY --from=schema-builder /repo/schema/out/typescript/categories.ts src/
COPY --from=schema-builder /repo/schema/out/categorized-integrations.json src/
COPY --from=schema-builder /repo/schema/categorization/categories.json src/

# also generates queries
RUN	make --file make/common.mk build
RUN	make --file make/dev.mk tool

# standalone `node_modules` with production dependencies only
# `--trust-lockfile` skips re-resolving against registry metadata (unavailable offline), the lockfile
# was already verified by `pnpm fetch` / `--frozen-lockfile` earlier in this build
RUN pnpm --filter server deploy --prod --offline --trust-lockfile /deployed/server

FROM node:24

WORKDIR /app

COPY --from=app-builder /repo/project/server/out/ ./out
COPY --from=app-builder /repo/project/server/src/service/database/query/ ./query
COPY --from=app-builder /repo/project/server/src/service/database/migration/ ./migration
COPY --from=app-builder /deployed/server/node_modules/ ./node_modules

COPY project/server/docker/ ./docker

CMD [ "/app/docker/entrypoint.sh" ]
