import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

import { unroll } from "../../utility/iterable";
import { Database, DatabaseSwappable, type IDatabase } from ".";
import {
	bake,
	type DatabaseAttached,
	type DatabaseDescriptorBaked,
	type DatabaseName,
	databaseAttached,
} from "./base";
import { DatabaseDomain } from "./domain";
import { DatabaseMigrate } from "./migrate";

const __dirname = import.meta.dirname;

type TestDatabase<DB extends DatabaseName | undefined> = IDatabase<DB> & {
	[Symbol.asyncDispose]: () => Promise<void>;
};

type TestDatabaseSwappable<DB extends DatabaseName | undefined> =
	(DB extends DatabaseName
		? {
				readonly [N in DB | DatabaseAttached[DB][number]]: DatabaseSwappable<N>;
			}
		: DatabaseSwappable<undefined>) & {
		[Symbol.asyncDispose]: () => Promise<void>;
	};

/** name the unnamed database is laid out under */
const unnamed = "testing";

export class TestDatabaseUnknownNameMigrateError extends Error {
	constructor() {
		super("migrations can only be performed for known named databases");
		Object.setPrototypeOf(this, TestDatabaseUnknownNameMigrateError.prototype);
	}
}

/* node:coverage disable */
const applyMigrations = async (
	database: Database<DatabaseName | undefined>,
	name: DatabaseName,
) => {
	const migrate = new DatabaseMigrate(database);
	const migrations = await unroll(
		DatabaseMigrate.migrations(
			join(__dirname, "..", "database", "migration", name),
		),
	);

	const plan = migrate.plan(migrations);
	if (!DatabaseMigrate.viable(plan)) {
		throw new Error("unreachable");
	}

	migrate.act(plan);
};

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
		join(directory, `${name ?? unnamed}.db`);

	const shouldMigrate = (name: DatabaseName | undefined): boolean =>
		typeof name !== "undefined"
			? (typeof migrate === "boolean" && migrate) ||
				(typeof migrate === "object" && migrate[name])
			: false;

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
					await applyMigrations(db, "staging");
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
				await applyMigrations(db, "derived");
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
				await applyMigrations(db, "staging");
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

	await database.spawn();

	return {
		begin: database.begin.bind(database),
		run: database.run.bind(database),
		explain: database.explain.bind(database),
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

/** databases laid out in domains of their own, so that they can be cloned and swapped */
export const testDatabaseSwappable = async <
	DB extends DatabaseName | undefined,
>(
	name: DB,
	migrate: DB extends DatabaseName
		? DatabaseAttached[DB] extends readonly []
			? boolean
			: Record<DatabaseAttached[DB][number] | DB, boolean>
		: false,
): Promise<TestDatabaseSwappable<DB>> => {
	const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-"),
	);

	const shouldMigrate = (name: DatabaseName): boolean =>
		typeof migrate === "boolean"
			? migrate
			: (migrate as Record<DatabaseName, boolean>)[name];

	// a connection attaches through the domain of what it attaches, which has to be laid out first
	const domains = new Map<DatabaseName | undefined, DatabaseDomain>(
		(typeof name === "undefined"
			? [undefined]
			: [...databaseAttached[name as DatabaseName], name]
		).map((name) => [
			name,
			new DatabaseDomain(join(directory, name ?? unnamed)),
		]),
	);

	/** in attachment order, whatever is attached comes first */
	const databases: DatabaseSwappable<DatabaseName | undefined>[] = [];
	for (const [name, domain] of domains) {
		const database = new DatabaseSwappable(
			name,
			domain,
			Object.fromEntries(
				(typeof name === "undefined" ? [] : databaseAttached[name]).map(
					(attached) => [attached, domains.get(attached)],
				),
			) as Record<never, DatabaseDomain>,
		);

		// migrations of an attaching database may well reach across
		if (typeof name !== "undefined" && shouldMigrate(name)) {
			await applyMigrations(database, name);
		}

		await database.spawn();

		databases.push(database);
	}

	const dispose = async () => {
		for (const database of databases.toReversed()) {
			await database.despawn();
			database.raw.close();
		}

		await rm(directory, { recursive: true, force: true });
	};

	// nothing to key an unnamed database by, it attaches nothing and is handed back as is
	if (typeof name === "undefined") {
		return Object.assign(databases[0], {
			[Symbol.asyncDispose]: dispose,
		}) as unknown as TestDatabaseSwappable<DB>;
	}

	return {
		...Object.fromEntries(
			databases.map((database) => [database.name, database]),
		),
		[Symbol.asyncDispose]: dispose,
	} as TestDatabaseSwappable<DB>;
};
/* node:coverage enable */
