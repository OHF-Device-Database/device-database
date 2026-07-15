import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

import { unroll } from "../../utility/iterable";
import { Database, type IDatabase } from ".";
import {
	bake,
	type DatabaseAttached,
	type DatabaseDescriptorBaked,
	type DatabaseName,
} from "./base";
import { DatabaseMigrate } from "./migrate";

const __dirname = import.meta.dirname;

type TestDatabase<DB extends DatabaseName | undefined> = IDatabase<DB> & {
	[Symbol.asyncDispose]: () => Promise<void>;
};

export class TestDatabaseUnknownNameMigrateError extends Error {
	constructor() {
		super("migrations can only be performed for known named databases");
		Object.setPrototypeOf(this, TestDatabaseUnknownNameMigrateError.prototype);
	}
}

/* node:coverage disable */
export const testDatabase = async <DB extends DatabaseName | undefined>(
	name: DB,
	migrate: DB extends DatabaseName
		? DatabaseAttached[DB] extends readonly []
			? boolean
			: Record<DatabaseAttached[DB][number] | DB, boolean>
		: false,
	attached?: DB extends DatabaseName
		? undefined
		: Record<string, DatabaseDescriptorBaked>,
): Promise<TestDatabase<DB>> => {
	const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-"),
	);

	const databasePath = (name: DatabaseName | undefined) =>
		join(directory, `${name ?? "testing"}.db`);

	const shouldMigrate = (name: DatabaseName | undefined): boolean =>
		typeof name !== "undefined"
			? (typeof migrate === "boolean" && migrate) ||
				(typeof migrate === "object" && migrate[name])
			: false;

	const applyMigrations = async (database: Database<DatabaseName>) => {
		const migrate = new DatabaseMigrate(database);
		const migrations = await unroll(
			DatabaseMigrate.migrations(
				join(__dirname, "..", "database", "migration", database.name),
			),
		);

		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw new Error("unreachable");
		}

		migrate.act(plan);
	};

	let database: Database<DatabaseName | undefined>;
	switch (name) {
		case "derived": {
			{
				const db = new Database(
					"staging",
					bake({ location: databasePath("staging") }),
					{},
				);
				if (shouldMigrate("staging")) {
					await applyMigrations(db);
				}
				db.raw.close();
			}

			const db = new Database(
				"derived",
				bake({ location: databasePath("derived") }),
				{
					staging: bake({ location: databasePath("staging"), readOnly: true }),
				},
			);
			if (shouldMigrate("derived")) {
				await applyMigrations(db);
			}

			database = db;

			break;
		}
		case "staging": {
			const db = new Database(
				"staging",
				bake({ location: databasePath("staging") }),
				{},
			);
			if (shouldMigrate("staging")) {
				await applyMigrations(db);
			}

			database = db;

			break;
		}
		case undefined: {
			database = new Database(
				undefined,
				bake({ location: databasePath(undefined) }),
				attached ?? {},
			);
			break;
		}
	}

	await database.spawn({ default: 1, background: 1 });

	return {
		begin: database.begin.bind(database),
		run: database.run.bind(database),
		raw: {
			query: database.raw.query.bind(database),
			exec: database.raw.exec.bind(database),
			location: database.raw.location.bind(database),
			close: database.raw.close.bind(database),
		},
		snapshot: database.snapshot.bind(database),
		...(typeof directory === "undefined"
			? {
					[Symbol.dispose]: () => database.raw.close(),
				}
			: {
					[Symbol.asyncDispose]: async () => {
						await database.despawn();
						database.raw.close();
						await rm(directory, { recursive: true, force: true });
					},
				}),
	} as TestDatabase<DB>;
};
/* node:coverage enable */
