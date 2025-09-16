import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { build } from "./api";
import { config } from "./config";
import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabase } from "./service/database";
import { DatabaseMigrate } from "./service/database/migrate";
import { unroll } from "./utility/iterable";

async function main(): Promise<void> {
	// finalize logger configuration here to not make main logger
	// setup depend on environment
	logger.level = config.logLevel;

	const app = new Hono();

	logger.info(`runtime: node, version: ${process.version}`, {
		version: process.version,
	});

	if (!config.secure) {
		logger.warn("running in insecure mode");
	}

	const _handlers = build(app, { cors: config.secure });

	const db = container.resolve(IDatabase);

	if (config.database.migrate) {
		const migrations = await unroll(DatabaseMigrate.migrations("./migration"));
		const migrate = new DatabaseMigrate(db);
		const plan = await migrate.plan(migrations);

		if (!DatabaseMigrate.viable(plan)) {
			console.error("unachievable migration plan", plan);
			process.exit(1);
		}

		await migrate.act(plan);
	}

	serve({
		fetch: app.fetch,
		port: config.port,
	});

	logger.info("serving", { port: config.port });
}

main().catch((e) => {
	logger.error("fatal error");
	console.error(e);

	process.exit(1);
});
