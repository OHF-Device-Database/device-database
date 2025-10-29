import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { build as buildApi } from "./api";
import { config as _config } from "./config";
import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabase } from "./service/database";
import { DatabaseMigrate } from "./service/database/migrate";
import { IIngress } from "./service/ingress";
import { build as buildSsr } from "./ssr";
import { unroll } from "./utility/iterable";
import { build as buildWeb } from "./web";

async function main(): Promise<void> {
	const config = _config();

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

	const ingress = container.resolve(IIngress);

	buildWeb(app);

	const handlers = buildApi(app, { cors: config.secure });
	await buildSsr(app, handlers, ingress.origin);

	app.onError((e, c) => {
		console.error(e);
		return c.text("error", 500);
	});

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
		hostname: config.host,
		port: config.port,
	});

	logger.info("serving", { port: config.port, host: config.host });
}

main().catch((e) => {
	logger.error("fatal error");
	console.error(e);

	process.exit(1);
});
