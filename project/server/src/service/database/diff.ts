/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import { StubIntrospection } from "../introspect/stub";
import { Database } from "./";
import { DatabaseMigrate, MIGRATION_TABLE_NAME } from "./migrate";

const options = {
	"schema-directory": {
		type: "string",
	},
	"migration-directory": {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options });

if (typeof values["schema-directory"] === "undefined") {
	console.error(
		"required parameter '--schema' missing (location of database schema)",
	);
	process.exit(1);
}
if (typeof values["migration-directory"] === "undefined") {
	console.error(
		"required parameter '--migration-directory' missing (location of migration directory)",
	);
	process.exit(1);
}

// holds schema definition
const a = new Database(":memory:", false, false, new StubIntrospection());
// holds migrations
const b = new Database(":memory:", false, false, new StubIntrospection());

const migrate = new DatabaseMigrate(b);
const migrations = await unroll(
	DatabaseMigrate.migrations(values["migration-directory"]),
);
const plan = migrate.plan(migrations);
if (!DatabaseMigrate.viable(plan)) {
	console.error("migration plan not viable");
	console.error(plan);
	process.exit(1);
}

for await (const ent of glob(`${values["schema-directory"]}/*.sql`, {
	withFileTypes: true,
})) {
	try {
		a.raw.exec(
			await readFile(join(ent.parentPath, ent.name), {
				encoding: "utf-8",
			}),
		);
	} catch (e) {
		console.error(`encounted error while executing <${ent.name}>`);
		throw e;
	}
}

migrate.act(plan);

let failed = false;

const PREFIXES = ["table", "view", "trigger", "index"] as const;
type Prefix = (typeof PREFIXES)[number];

const LONGEST_PREFIX_LENGTH: number = PREFIXES.reduce(
	(acc: number, item: string) => {
		const length = item.length;
		return length > acc ? length : acc;
	},
	0,
);

const prefix = (prefix: Prefix) => {
	return `${prefix.padStart(LONGEST_PREFIX_LENGTH, " ")} |`;
};

{
	const query = `
	  select
  	  sm.name "table",
  		pti.name "column",
  		pti.type,
  		pti."notnull" "notNull",
  		pti.dflt_value "defaultValue",
  		pti.pk "primaryKey",
  		pfkl.on_update "onUpdate",
  		pfkl.on_delete "onDelete",
   		pfkl.match "match"
		from
		  sqlite_master sm,
			pragma_table_info(sm.name) pti join pragma_foreign_key_list(sm.name) pfkl on (
			  pti.name = pfkl."from"
			)
		where
		  sm.type = 'table' and sm.name != '${MIGRATION_TABLE_NAME}';
	`;

	type QualifiedColumn = {
		table: string;
		column: string;
		type: string;
		notNull: number;
		defaultValue: string | null;
		primaryKey: number;
		onDelete: string;
		onUpdate: string;
		match: string;
	};

	type UnqualifiedColumn = Omit<QualifiedColumn, "table" | "column">;

	const aSchema: Map<
		// table name
		string,
		Map<
			// column name
			string,
			UnqualifiedColumn
		>
	> = new Map();
	for (const row of a.raw.query(query, { returnArray: false }, {})) {
		const cast = row as QualifiedColumn;

		const bucket = aSchema.get(cast.table);
		if (typeof bucket === "undefined") {
			aSchema.set(cast.table, new Map([[cast.column, cast]]));
		} else {
			bucket.set(cast.column, cast);
		}
	}

	const bSchema: Map<
		// table name
		string,
		Map<
			// column name
			string,
			UnqualifiedColumn
		>
	> = new Map();
	for (const row of b.raw.query(query, { returnArray: false }, {})) {
		const cast = row as QualifiedColumn;

		const bucket = bSchema.get(cast.table);
		if (typeof bucket === "undefined") {
			bSchema.set(cast.table, new Map([[cast.column, cast]]));
		} else {
			bucket.set(cast.column, cast);
		}
	}

	for (const [table, aColumns] of aSchema) {
		const bColumns = bSchema.get(table);
		if (typeof bColumns === "undefined") {
			console.error(`${prefix("table")} <${table}> missing in migrations`);
			failed = true;
			continue;
		}

		for (const [aColumnName, aColumn] of aColumns) {
			const bColumn = bColumns.get(aColumnName);
			if (typeof bColumn === "undefined") {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] is missing in migrations`,
				);
				failed = true;
				continue;
			}

			if (aColumn.type !== bColumn.type) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] has type <${aColumn.type}> in schema, <${bColumn.type}> in migrations`,
				);
				failed = true;
			}

			if (aColumn.notNull !== bColumn.notNull) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] is ${aColumn.notNull ? "<not null>" : "<null>"} in schema, but is ${bColumn.notNull ? "<not null>" : "<null>"} in migrations`,
				);
				failed = true;
			}

			if (aColumn.defaultValue !== bColumn.defaultValue) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] has ${isSome(aColumn.defaultValue) ? `default value <${aColumn.defaultValue}>` : "no default value"} in schema, but ${isSome(bColumn.defaultValue) ? `<${bColumn.defaultValue}>` : "no default value"} in migrations`,
				);
				failed = true;
			}

			if (aColumn.primaryKey !== bColumn.primaryKey) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] is ${aColumn.primaryKey ? "a primary key" : "not a primary key"} in schema, but is ${bColumn.primaryKey ? "a primary key" : "not a primary key"} in migrations`,
				);
				failed = true;
			}

			if (aColumn.onUpdate !== bColumn.onUpdate) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] "on_update" is <${aColumn.onUpdate}> in schema, but is <${bColumn.onUpdate}> in migrations`,
				);
				failed = true;
			}

			if (aColumn.onDelete !== bColumn.onDelete) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] "on_delete" is <${aColumn.onDelete}> in schema, but is <${bColumn.onDelete}> in migrations`,
				);
				failed = true;
			}

			if (aColumn.match !== bColumn.match) {
				console.error(
					`${prefix("table")} [${table}.${aColumnName}] "match" is <${aColumn.match}> in schema, but is <${bColumn.match}> in migrations`,
				);
				failed = true;
			}
		}
	}
}

{
	const query = `
    select
      name,
      sql
    from
      sqlite_master
    where
      type = 'view'
	`;

	type Row = {
		name: string;
		sql: string;
	};

	const aSchema: Map<
		// view name
		string,
		// view definition
		string
	> = new Map();
	for (const row of a.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		aSchema.set(cast.name, cast.sql);
	}

	const bSchema: Map<
		// view name
		string,
		// view definition
		string
	> = new Map();
	for (const row of b.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		bSchema.set(cast.name, cast.sql);
	}

	for (const [aName, aDefinition] of aSchema) {
		const bDefinition = bSchema.get(aName);
		if (typeof bDefinition === "undefined") {
			console.warn(`${prefix("view")} <${aName}> missing in migrations`);
			failed = true;
			continue;
		}

		if (aDefinition !== bDefinition) {
			console.warn(`${prefix("view")} <${aName}> definiton mismatch`);
			console.log(">>> schema");
			console.log(aDefinition);
			console.log(">>> migration");
			console.log(bDefinition);
		}
	}
}

{
	const query = `
	  select
			name,
			sql
		from
		  sqlite_master
		where
		  type = 'index' and
			-- filter out automatically created indexes
			sql != '';
	`;

	type Row = {
		name: string;
		sql: string;
	};

	const aSchema: Map<
		// index name
		string,
		// index definition
		string
	> = new Map();
	for (const row of a.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		aSchema.set(cast.name, cast.sql);
	}

	const bSchema: Map<
		// index name
		string,
		// index definition
		string
	> = new Map();
	for (const row of b.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		bSchema.set(cast.name, cast.sql);
	}

	for (const [aName, aDefinition] of aSchema) {
		const bDefinition = bSchema.get(aName);
		if (typeof bDefinition === "undefined") {
			console.warn(`${prefix("index")} <${aName}> missing in migrations`);
			failed = true;
			continue;
		}

		if (aDefinition !== bDefinition) {
			console.warn(`${prefix("index")} <${aName}> definiton mismatch`);
			console.log(">>> schema");
			console.log(aDefinition);
			console.log(">>> migration");
			console.log(bDefinition);
		}
	}
}

{
	const query = `
    select
      name,
      sql
    from
      sqlite_master
    where
      type = 'trigger';
  `;

	type Row = {
		name: string;
		sql: string;
	};

	const aSchema: Map<
		// trigger name
		string,
		// trigger definition
		string
	> = new Map();
	for (const row of a.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		aSchema.set(cast.name, cast.sql);
	}

	const bSchema: Map<
		// trigger name
		string,
		// trigger definition
		string
	> = new Map();
	for (const row of b.raw.query(query, { returnArray: false }, {})) {
		const cast = row as Row;
		bSchema.set(cast.name, cast.sql);
	}

	for (const [aName, aDefinition] of aSchema) {
		const bDefinition = bSchema.get(aName);
		if (typeof bDefinition === "undefined") {
			console.warn(`${prefix("trigger")} <${aName}> missing in migrations`);
			failed = true;
			continue;
		}

		if (aDefinition !== bDefinition) {
			console.warn(`${prefix("trigger")} <${aName}> definiton mismatch`);
			console.log(">>> schema");
			console.log(aDefinition);
			console.log(">>> migration");
			console.log(bDefinition);
		}
	}
}

process.exit(failed ? 1 : 0);
