import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { hrtime } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { getHeapStatistics } from "node:v8";

import { serve } from "@hono/node-server";
import { addMinutes } from "date-fns";
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
import {
	LockFile,
	LockFileAcquiredByOtherProcessError,
} from "./utility/lockfile";
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

let lockfilePath;
lockfilePath: {
	const db = container.resolve(IDatabaseStaging);

	const databaseLocation = db.raw.location();
	if (
		// no open file handles can exist for in-memory database
		isNone(databaseLocation)
	) {
		break lockfilePath;
	}

	lockfilePath = join(dirname(databaseLocation), "staging-lock");
}

let databaseUnlocked;
databaseUnlocked: {
	const { resolve, reject, promise } = Promise.withResolvers<void>();
	databaseUnlocked = promise;

	if (!config.initiallyConcurrent || typeof lockfilePath === "undefined") {
		resolve();
		break databaseUnlocked;
	}

	const lockfile = new LockFile(lockfilePath);

	let exiting = false;
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.once(signal, async () => {
			if (exiting) {
				return;
			}

			exiting = true;

			try {
				await lockfile.release();
			} catch (e) {
				console.error(e);
				process.exit(1);
			}

			process.exit(0);
		});
	}

	// when new instance is rolled out, it temporarily runs side-by-side with old instance
	// this can lead to busy timeouts and races, as old instance also attempts to lock database
	void (async () => {
		const deadline = addMinutes(new Date(), 10);

		logger.info("acquiring lock");

		while (new Date() < deadline) {
			try {
				await lockfile.acquire();
			} catch (e) {
				if (!(e instanceof LockFileAcquiredByOtherProcessError)) {
					throw e;
				}

				await sleep(1_000);
				continue;
			}

			logger.info("lock acquired");
			resolve();
			return;
		}

		reject(new Error("timeout while acquiring lock for database"));
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
	const dbStaging = container.resolve(IDatabaseStaging);
	const ingest = container.resolve(ISnapshotDeferIngest);

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

				// no need for checkpoint _before_ derivable has run
				if (status.kind === "pending") {
					continue;
				}

				// pause ingesting to ensure that writes don't bunch up
				{
					const start = hrtime.bigint();
					await ingest.pause();
					const end = hrtime.bigint();
					logger.debug(`paused ingestion in ${formatNs(end - start)}s`, {
						took: end - start,
					});
				}

				const start = hrtime.bigint();
				const checkpoint = await dbStaging.run<{
					busy: number;
					log: number;
					checkpointed: number;
				}>({
					name: "Checkpoint",
					database: "staging",
					connectionMode: "w",
					query: "pragma wal_checkpoint(full)",
					integerMode: "number",
					rowMode: "object",
					parameters: [],
					resultMode: "one",
				});
				const end = hrtime.bigint();

				if (isNone(checkpoint)) {
					throw new Error("unreachable");
				}

				logger[checkpoint.busy === 0 ? "info" : "warn"](
					`checkpointed ${checkpoint.checkpointed} of ${checkpoint.log} pages (${checkpoint.log - checkpoint.checkpointed} remaining) in ${formatNs(end - start)}s`,
					{
						log: checkpoint.log,
						checkpointed: checkpoint.checkpointed,
						remaining: checkpoint.log - checkpoint.checkpointed,
						took: end - start,
					},
				);

				ingest.resume();
			}
		}
	}
})();
