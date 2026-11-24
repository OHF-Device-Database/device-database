/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { logger } from "../../../logger";
import { Database, type IDatabase } from "../../../service/database";
import { bake } from "../../../service/database/base";
import { DatabaseMigrate } from "../../../service/database/migrate";
import { unroll } from "../../../utility/iterable";

/**
 * opens the index database at `location`, migrated, for the duration of `fn`
 *
 * leaves a single self-contained file behind, i.e. without wal
 */
export const seeding = async (
	location: string,
	migrationDirectory: string,
	fn: (db: IDatabase<"index">) => Promise<void>,
): Promise<void> => {
	// progress is logged at debug
	logger.level = "debug";

	// index attaches derived, which it doesn't depend on
	const temporary = await mkdtemp(
		join(tmpdir(), "device-database-index-seed-"),
	);
	try {
		new DatabaseSync(join(temporary, "derived.db")).close();

		const db = new Database("index", bake({ location }), {
			derived: bake({
				location: join(temporary, "derived.db"),
				readOnly: true,
			}),
		});

		{
			const migrate = new DatabaseMigrate(db);
			const plan = migrate.plan(
				await unroll(DatabaseMigrate.migrations(migrationDirectory)),
			);
			if (!DatabaseMigrate.viable(plan)) {
				console.error("migration plan not viable");
				console.error(plan);
				process.exit(1);
			}
			migrate.act(plan);
		}

		await db.spawn();
		try {
			await fn(db);
		} finally {
			await db.despawn();
			db.raw.close();

			// checkpoints and removes the wal
			const raw = new DatabaseSync(location);
			raw.exec("pragma journal_mode = delete");
			raw.close();
		}

		console.log(`seeded <${location}>`);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
};
