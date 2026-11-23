# sql-codegen

generates typed query builders from `.sql` files.
instead of reimplementing a sql parser and schema catalog like [sqlc](https://sqlc.dev/), queries are prepared against a real `node:sqlite` database (result columns are typed from `StatementSync#columns()` and schema (`pragma table_xinfo`))

requires node.js >= 24.10 (`DatabaseSync#setAuthorizer`).

## usage

```typescript
import { DatabaseSync } from "node:sqlite";

import { generateDirectory } from "sql-codegen";

// set up database as it would also be configured at runtime
using db = new DatabaseSync(":memory:");
db.exec(schema);
db.function("my_function", (value) => value);

generateDirectory({
  db,
  // literal type discriminator on `Query` / `BoundQuery`
  database: "main",
  // every `<name>.sql` produces a `<name>.ts` next to it
  directory: "src/query/main",
});
```

`generate(source, options)` returns the generated module for a single file's contents instead of writing it.

generated files import `Query` and `BoundQuery` from `sql-codegen/types` (the runtime contract in [`src/types.ts`](src/types.ts)).
the import is type-only, so `sql-codegen` can remain a dev dependency.
(`typesVersions` makes the subpath resolvable for consumers using legacy `"moduleResolution": "node"`, which ignores `exports`.)
to import them from elsewhere, set `typesImport` to a module specifier relative to generated files.

## query files

```sql
-- name: GetDevice :one
-- column: duplicates text not null
-- any other comment is kept as documentation
select
    id,
    name,
    (select json_group_array(id) from device d1 where d1.canonical_id = d.id) duplicates
from
    device d
where
    id = @id;
```

- every statement is preceded by `-- name: <Name> <command>` and terminated by `;` (or the end of the file)
  - `:one` → single row (or none), `:many` → rows, `:exec` → no rows
  - the name prefix determines the connection mode: `Get` → `"r"`; `Insert`, `Update`, `Upsert`, `Delete` → `"w"`.
    reading queries that write are rejected (detected with an authorizer while preparing)
- parameters are named (`@name`, `:name`, `$name`) and are rewritten to numbered parameters (`?1`, `?2`, …) in order of first appearance.
  positional parameters (`?`, `?1`) are rejected, as they can't be named.
  parameters are typed as `SQLInputValue`, inferring them would require examining the query plan
- `-- column: <name> <declared type> [not null]` annotations (between `-- name:` and the statement) type result columns.
  the declared type is interpreted with [sqlite's affinity rules](https://www.sqlite.org/datatype3.html#determination_of_column_affinity), like the type of a table column.
  quote names that contain whitespace (`-- column: "some name" text`)

## inferred types

| affinity of origin column | `integerMode: "number"` | `integerMode: "bigint"` |
| ------------------------- | ----------------------- | ----------------------- |
| integer                   | `number`                | `bigint`                |
| real                      | `number`                | `number`                |
| numeric                   | `number`                | `number \| bigint`      |
| text                      | `string`                | `string`                |
| blob                      | `Uint8Array`            | `Uint8Array`            |
| none / `any`              | `unknown`               | `unknown`               |

columns are nullable unless their origin column is declared `not null` (or is a non-nullable primary key).

### limitations

sqlite only reports the origin of a result column, not how it got there, so inference is deliberately simple:

- columns that don't directly originate from a table column (expressions, aggregates, `cast(…)`) are typed `unknown` and need a `-- column:` annotation.
  `cast(… as …)` can't replace annotations, sqlite doesn't report a declared type for it
- when a statement contains an outer join (`left` / `right` / `full`), every column is considered nullable
- compound selects (`union`, …) report the origin of the first select, scalar subqueries the origin of their result column,
  so null-ability may be too narrow (e.g. a scalar subquery without rows yields `null`)
- result column names have to be unique, they'd otherwise collapse in object row mode
- any authorizer installed on the provided database is replaced while preparing, and removed afterwards

## development

part of the repository's pnpm workspace, dependencies are installed by `pnpm install` in the repository root.

```sh
pnpm run check   # tsc
pnpm run lint    # biome (formatting, lint, import order)
pnpm run format  # apply biome fixes
pnpm test
```
