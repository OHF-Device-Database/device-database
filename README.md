# 💾 device database

## prerequisits

* [Node.js](https://nodejs.org/en/download/current) >= 24.0
* [Git Large File Storage](https://git-lfs.com/)
* [sqlc](https://docs.sqlc.dev/en/stable/overview/install.html)

  we use a custom [wasm codegen plugin](https://docs.sqlc.dev/en/latest/guides/plugins.html#wasm-plugins) (`tool/sqlc-generate-typescript-plugin`) to generate ergonomic query types. a `wasm32-wasip1` Rust toolchain is required to build the plugin, but the plugin itself is also checked into lfs.

## running
### development
1. install dependencies and `npm install` in `schema`, `project/server`
2. build the OpenAPI schema (`make --directory schema`)
3. start the server (`make --directory project/server start`)

### container
1. build with `make --directory project/server -f make/ops.mk build-container`
2. run with `make --directory project/server start-container` (a shorthand that exports required environment variables)

## common operations
* adding an endpoint
  1. add your endpoint definition to the OpenAPI schema (`schema/spec/main.yaml`)
  2. build the schema (`make --directory schema`)
  3. write a handler for your endpoint and prime it (`project/server/src/api/endpoint`)
  4. import / use your endpoint (`project/server/src/api/index.ts`)

* writing a database migration
  1. create a new migration file (`make --directory project/server migration-new`)
  2. manually ensure that schema and migrations don't diverge (TODO: do this automatically)
