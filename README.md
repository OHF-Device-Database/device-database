# 💾 device database

## prerequisits

- [Node.js](https://nodejs.org/en/download/current) >= 24.16
- [pnpm](https://pnpm.io/installation) 12
- [Git Large File Storage](https://git-lfs.com/)

queries in `project/server/src/service/database/query` are turned into typed query builders by [`tool/sql-codegen`](tool/sql-codegen), which uses `node:sqlite` itself to validate queries and infer result types.

## running

### development

1. install dependencies and run `pnpm install` in the repository root
2. build the OpenAPI schema (`make --directory schema`)
3. start the server (`make --directory project/server start`)

   no environment variables are required for development, all variables are documented in [`project/server/src/config/index.ts`](https://github.com/OHF-Device-Database/device-database/blob/main/project/server/src/config/index.ts)

   when a client is served from another origin (e.g. when doing [frontend](https://github.com/OHF-Device-Database/frontend) development) set `SECURE=false`  
   this disarms cors, so consider it a reminder that the running configuration is _not_ secure

### container

1. build with `make --directory project/server -f make/ops.mk build-container`
2. run with `make --directory project/server start-container` (a shorthand that exports required environment variables)

## common operations

- adding an endpoint
  1. add your endpoint definition to the OpenAPI schema (`schema/spec/main.yaml`)
  2. build the schema (`make --directory schema`)
  3. write a handler for your endpoint and prime it (`project/server/src/api/endpoint`)
  4. import / use your endpoint (`project/server/src/api/index.ts`)

- writing a database migration
  1. create a new migration file (`make --directory project/server migration-new`)
  2. use `make --directory project/server migration-diff` to ensure that migrations and schema don't diverge
