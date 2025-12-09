import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unroll } from "../../utility/iterable";
import { StubIntrospection } from "../introspect/stub";
import { Database, type IDatabase } from ".";
import { DatabaseMigrate } from "./migrate";

const __dirname = import.meta.dirname;

type TestDatabase<InMemory extends boolean> = IDatabase &
	(InMemory extends true
		? { [Symbol.dispose]: () => void }
		: { [Symbol.asyncDispose]: () => Promise<void> });

/* node:coverage disable */
export const testDatabase = async <const InMemory extends boolean>(
	inMemory: InMemory,
	migrate: boolean = true,
): Promise<TestDatabase<InMemory>> => {
	let directory: string | undefined;
	if (!inMemory) {
		directory = await mkdtemp(join(tmpdir(), "device-database-testing-"));
	}

	const database = new Database(
		typeof directory !== "undefined"
			? join(directory, "testing.db")
			: ":memory:",
		false,
		false,
		new StubIntrospection(),
	);

	if (migrate) {
		const migrate = new DatabaseMigrate(database);
		const migrations = await unroll(
			DatabaseMigrate.migrations(
				join(__dirname, "..", "database", "migration"),
			),
		);

		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw new Error("unreachable");
		}

		migrate.act(plan);
	}

	if (!inMemory) {
		await database.spawn(1);
	}

	return {
		begin: database.begin.bind(database),
		run: database.run.bind(database),
		raw: {
			query: database.raw.query.bind(database),
			exec: database.raw.exec.bind(database),
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
	} as TestDatabase<boolean> as unknown as TestDatabase<InMemory>;
};
/* node:coverage enable */
