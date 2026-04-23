import { parseArgs } from "node:util";

import { DatabaseMigrate, MIGRATION_TABLE_NAME } from ".";

const {
	values: {
		"migration-directory": argMigrationDirectory,
		"migration-name": argMigrationNames,
	},
} = parseArgs({
	options: {
		"migration-directory": {
			type: "string",
			default: "./src/service/database/migration/staging",
		},
		"migration-name": {
			type: "string",
			multiple: true,
		},
	},
});

for await (const migration of DatabaseMigrate.migrations(
	argMigrationDirectory,
)) {
	if (
		typeof argMigrationNames !== "undefined" &&
		!argMigrationNames.includes(migration.name)
	) {
		continue;
	}

	console.log(`-- ${migration.name}`);
	console.log(
		`insert into ${MIGRATION_TABLE_NAME} (id, name, hash, created_at) values (${migration.id}, '${migration.name}', '${migration.hash}', ${Math.floor(Date.now() / 1000)});`,
	);
}
