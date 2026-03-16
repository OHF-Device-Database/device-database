import { availableParallelism } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { getHeapStatistics } from "node:v8";

import { serve } from "@hono/node-server";
import { addSeconds } from "date-fns";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { build as buildApi } from "./api";
import { config as _config } from "./config";
import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabaseDerived, IDatabaseStaging } from "./service/database";
import { DatabaseMigrate } from "./service/database/migrate";
import { Derive, IDeriveDerived } from "./service/derive";
import { IIngress } from "./service/ingress";
import { IIntrospectionMixinHono } from "./service/introspect/mixin-hono";
import { ISnapshotDeferIngest } from "./service/snapshot/defer/ingest";
import { build as buildSsr } from "./ssr";
import { isNone } from "./type/maybe";
import { formatNs } from "./utility/format";
import { unroll } from "./utility/iterable";
import { lsof } from "./utility/list-open-file-handles";
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

const parallelism = availableParallelism();
for (const [db, workerCount] of [
	[
		container.resolve(IDatabaseStaging),
		{
			default: parallelism,
			background: Math.max(Math.floor(parallelism / 2), 1),
		},
	],
	[
		container.resolve(IDatabaseDerived),
		{
			default: parallelism,
			background: 1,
		},
	],
] as const) {
	if (config.database.migrate) {
		const migrations = await unroll(
			DatabaseMigrate.migrations(join("./migration", db.name)),
		);
		const migrate = new DatabaseMigrate(db);
		const plan = migrate.plan(migrations);

		if (!DatabaseMigrate.viable(plan)) {
			console.error("unachievable migration plan", plan);
			process.exit(1);
		}

		migrate.act(plan);
	}

	await db.spawn(workerCount);
}

serve({
	fetch: app.fetch,
	hostname: config.host,
	port: config.port,
});

logger.info("serving", { port: config.port, host: config.host });

// when new instance is rolled out, it temporarily runs side-by-side with old instance
// this can lead to busy timeouts, as old instance also attempts to lock database →
// use open file handles as an indicator of when old instance was deprovisioned
let databaseUnlocked;
initiallyConcurrent: {
	const { resolve, promise } = Promise.withResolvers<void>();
	databaseUnlocked = promise;

	if (!config.initiallyConcurrent) {
		resolve();
		break initiallyConcurrent;
	}

	const db = container.resolve(IDatabaseStaging);
	const databaseLocation = db.raw.location();
	if (
		// no open file handles can exist for in-memory database
		isNone(databaseLocation)
	) {
		resolve();
		break initiallyConcurrent;
	}

	logger.info("waiting for closing of open file handles");

	void (async () => {
		const deadline = addSeconds(new Date(), 60);
		while (new Date() < deadline) {
			const pids = await unroll(lsof(databaseLocation));

			if (pids.length === 1 && pids[0] === process.pid) {
				logger.info("open file handles subsided");
				resolve();
				break;
			}

			await sleep(1000);
		}

		logger.error("unexpected open file handles for database");
		process.exit(1);
	})();
}

void (async () => {
	const snapshotDeferIngest = container.resolve(ISnapshotDeferIngest);
	if (config.snapshot.defer.process) {
		await databaseUnlocked;

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
	}
})();

void (async () => {
	const derive = container.resolve(IDeriveDerived);
	{
		await databaseUnlocked;

		let epoch = Derive.epoch();
		while (true) {
			epoch = await derive.wait(epoch);
			const plan = derive.plan(epoch);

			if (!Derive.viable(plan)) {
				throw new Error(`derive plan not viable <${JSON.stringify(plan)}>`);
			}

			for await (const status of derive.act(plan)) {
				switch (status.kind) {
					case "pending":
						logger.info(`running <${status.id.description}>`, {
							identifier: status.id,
						});
						break;
					case "success":
						logger.info(
							`ran <${status.id.description}> in ${formatNs(status.took)}s`,
							{ identifier: status.id, took: status.took },
						);
						break;
					case "error":
						logger.error(`error while running <${status.id.description}>`, {
							identifier: status.id,
						});
						console.error(status.error);
				}
			}
		}
	}
})();
