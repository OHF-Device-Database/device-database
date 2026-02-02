import { getHeapStatistics } from "node:v8";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { build as buildApi } from "./api";
import { config as _config } from "./config";
import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabase } from "./service/database";
import { DatabaseMigrate } from "./service/database/migrate";
import { IIngress } from "./service/ingress";
import { IIntrospectionMixinHono } from "./service/introspect/mixin-hono";
import { ISnapshotDeferIngest } from "./service/snapshot/defer/ingest";
import { build as buildSsr } from "./ssr";
import { unroll } from "./utility/iterable";
import { build as buildWeb } from "./web";

const config = _config();

// finalize logger configuration here to not make main logger
// setup depend on environment
logger.level = config.logLevel;

const app = new Hono();

logger.info(`runtime: node, version: ${process.version}`, {
	version: process.version,
	...getHeapStatistics(),
});

if (!config.secure) {
	logger.warn("running in insecure mode");
}

const ingress = container.resolve(IIngress);

app.use(container.resolve(IIntrospectionMixinHono).middleware());

buildWeb(app);

const handlers = buildApi(app, {
	cors: config.secure,
});
await buildSsr(app, handlers, ingress.origin);

app.onError((e, c) => {
	if (e instanceof HTTPException) {
		if (typeof e.cause !== "undefined") {
			console.error(e.cause);
		}

		return e.getResponse();
	}

	console.error(e);
	return c.text("error", 500);
});

const db = container.resolve(IDatabase);
if (config.database.migrate) {
	const migrations = await unroll(DatabaseMigrate.migrations("./migration"));
	const migrate = new DatabaseMigrate(db);
	const plan = migrate.plan(migrations);

	if (!DatabaseMigrate.viable(plan)) {
		console.error("unachievable migration plan", plan);
		process.exit(1);
	}

	migrate.act(plan);
}

await db.spawn();

serve({
	fetch: app.fetch,
	hostname: config.host,
	port: config.port,
});

logger.info("serving", { port: config.port, host: config.host });

const snapshotDeferIngest = container.resolve(ISnapshotDeferIngest);
for await (const step of snapshotDeferIngest.ingest()) {
	let delay;
	switch (step) {
		case "idle":
			delay = 5_000;
			break;
		case "acted":
			delay = 100;
			break;
	}

	await new Promise((resolve) => setTimeout(resolve, delay));
}
