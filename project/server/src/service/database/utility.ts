import { join } from "node:path";

import { unroll } from "../../utility/iterable";
import { Database } from ".";
import { DatabaseMigrate } from "./migrate";

const __dirname = import.meta.dirname;

/* c8 ignore start */
export const testDatabase = async (): Promise<Database> => {
	const database = new Database(":memory:", false, false);
	{
		const migrate = new DatabaseMigrate(database);
		const migrations = await unroll(
			DatabaseMigrate.migrations(
				join(__dirname, "..", "database", "migration"),
			),
		);

		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw new Error("unreachable");
		}

		await migrate.act(plan);
	}

	return database;
};
/* c8 ignore stop */
