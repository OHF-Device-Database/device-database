# sqlc-generate-typescript-plugin

## usage

* vendor types
  ```typescript
  import type { SQLInputValue } from "node:sqlite";

  export type ResultMode = "one" | "many" | "none";
  export type ConnectionMode = "r" | "w";

  export type BoundQuery<RM extends ResultMode, CM extends ConnectionMode, Record> = {
      name: string;
      query: string;
      parameters: SQLInputValue[],
      rowMode: "object" | "tuple";
      integerMode: "number" | "bigint";
      resultMode: RM,
      connectionMode: CM,
  }

  export type Query<
      RM extends ResultMode,
      CM extends ConnectionMode,
      ParametersNamed,
      ParametersAnonymous,
      RecordRowModObjectIntegerModeNumber,
      RecordRowModObjectIntegerModeBigInt,
      RecordRowModeTupleIntegerModeNumber,
      RecordRowModeTupleIntegerModeBigInt
  > = {
      name: string;
      query: string;
      bind: {
          named(parameters: ParametersNamed, configuration?: { rowMode: "object", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          named(parameters: ParametersNamed, configuration: { rowMode?: "object", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          named(parameters: ParametersNamed, configuration: { rowMode: "object", integerMode?: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          named(parameters: ParametersNamed, configuration: { rowMode: "object", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeBigInt>,
          named(parameters: ParametersNamed, configuration: { rowMode?: "object", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeBigInt>,
          named(parameters: ParametersNamed, configuration: { rowMode: "tuple", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeNumber>,
          named(parameters: ParametersNamed, configuration: { rowMode: "tuple", integerMode?: "number" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeNumber>,
          named(parameters: ParametersNamed, configuration: { rowMode: "tuple", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeBigInt>,

          anonymous(parameters: ParametersAnonymous, configuration?: { rowMode: "object", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode?: "object", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode: "object", integerMode?: "number" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeNumber>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode: "object", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeBigInt>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode?: "object", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModObjectIntegerModeBigInt>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode: "tuple", integerMode: "number" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeNumber>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode: "tuple", integerMode?: "number" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeNumber>,
          anonymous(parameters: ParametersAnonymous, configuration: { rowMode: "tuple", integerMode: "bigint" }): BoundQuery<RM, CM, RecordRowModeTupleIntegerModeBigInt>,
      }
  }
  ```
  necessary because even with exact duplicate types typescript isn't able to infer record types

* add plugin to `sqlc.yaml`
  ```yaml
    version: "2"
    plugins:
      - name: plugin
        wasm:
          url: file://./plugin.wasm
    sql:
      - schema: src/service/database/schema.sql
        queries: src/database/query
        engine: sqlite
        codegen:
          - out: src/query
            plugin: plugin
            options:
              types_path: <path-to-vendored-types>
  ```
