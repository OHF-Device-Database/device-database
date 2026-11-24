// generates typed query builders from `src/service/database/query/<database>/*.sql`
// queries are prepared against in-memory databases laid out like at runtime

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { generateDirectory } from "sql-codegen";

import { stdLoad } from "../src/service/database/std.ts";

import type { DatabaseName } from "../src/service/database/base.ts";

const SCHEMA_DIRECTORY = "src/service/database/schema";
const QUERY_DIRECTORY = "src/service/database/query";

// databases attached at runtime, as long as no name duplicates occur, there is no need to qualify table names
const attachments = {
	staging: [],
	derived: ["staging"],
	index: ["derived"]
} as const satisfies Record<DatabaseName, DatabaseName[]>;

const schemaOf = (name: DatabaseName): DatabaseSync => {
	const db = new DatabaseSync(":memory:");
	const directory = join(SCHEMA_DIRECTORY, name);
	for (const file of readdirSync(directory).sort()) {
		if (file.endsWith(".sql")) {
			db.exec(readFileSync(join(directory, file), "utf8"));
		}
	}
	return db;
};

for (const [name, attached] of Object.entries(attachments) as [
	DatabaseName,
	readonly DatabaseName[],
][]) {
	using db = schemaOf(name);
	stdLoad(db);

	for (const attachment of attached) {
		using schema = schemaOf(attachment);
		db.exec(`attach ':memory:' as ${attachment}`);
		db.deserialize(schema.serialize(), { dbName: attachment });
	}

	generateDirectory({
		db,
		database: name,
		directory: join(QUERY_DIRECTORY, name),
	});
}
