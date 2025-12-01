import { spawn } from "node:child_process";
import { glob, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers";
import { parseArgs } from "node:util";
import { isMainThread, Worker, workerData } from "node:worker_threads";

import { Agent, fetch, setGlobalDispatcher } from "undici";

const expectedAfter = 3;
const ttl = 2;

const randomWithin = (min: number, max: number) =>
	Math.random() * (max - min) + min;

if (isMainThread) {
	const { values } = parseArgs({
		options: {
			snapshots: { type: "string" },
			workers: { type: "string" },
		},
	});

	let workerCount = 10;
	if (typeof values.workers !== "undefined") {
		const parsed = parseInt(values.workers, 10);
		if (Number.isNaN(parsed)) {
			console.error(
				"invalid value for parameter '--workers' (number of workers to spawn)",
			);
			process.exit(1);
		}

		workerCount = parsed;
	}

	const snapshots: string[] = [];
	for await (const snapshot of glob(
		`${values.snapshots ?? join(import.meta.dirname, "snapshots")}/*.json`,
	)) {
		snapshots.push(snapshot);
	}

	const port = await new Promise<number | undefined>((resolve, reject) => {
		const server = createServer();
		server.listen(0, () => {
			const address = server.address();
			if (typeof address !== "object") {
				reject();
				return;
			}

			const port = address?.port;

			server.close(() => resolve(port));
		});
		server.once("error", reject);
	});

	if (typeof port === "undefined") {
		console.error("could not obtain port");
		process.exit(1);
	}

	const databaseDirectory = await mkdtemp(join(tmpdir(), "snapshot-"));
	const database = join(databaseDirectory, "server.db");

	console.info(`database path: <${database}>`);

	const spawned = spawn(
		"make",
		["--directory", join(import.meta.dirname, "..", ".."), "start"],
		{
			env: {
				...process.env,
				PORT: String(port),
				EXTERNAL_AUTHORITY: `localhost:${port}`,
				EXTERNAL_SECURE: "false",
				DATABASE_PATH: join(databaseDirectory, "server.db"),
				SNAPSHOT_VOUCHER_EXPECTED_AFTER: String(expectedAfter),
				SNAPSHOT_VOUCHER_TTL: String(ttl),
			},
		},
	);

	spawned.stdout.on("data", (data) => {
		process.stdout.write(`[server/*] ${data}`);
	});
	spawned.stderr.on("data", (data) => {
		process.stderr.write(`[server/!] ${data}`);
	});

	// wait for server to come online
	while (true) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
			if (response.ok) {
				break;
			}
		} catch {}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	const workers: Worker[] = [];
	for (let i = 0; i < workerCount; i++) {
		const snapshot = snapshots[i % snapshots.length];
		const worker = new Worker(import.meta.filename, {
			workerData: {
				id: i,
				snapshot,
				url: `http://127.0.0.1:${port}/api/v1/snapshot/1`,
			},
		});
		workers.push(worker);
	}

	await new Promise<void>((resolve) => {
		process.once("SIGINT", async () => {
			for (const worker of workers) {
				await worker.terminate();
			}

			spawned.kill();

			resolve();
		});
	});
} else {
	const { snapshot, url, id } = workerData;

	setGlobalDispatcher(new Agent({ connect: { timeout: 30_000 } }));

	const body = await readFile(snapshot, "utf-8");

	let submissionIdentifier: string | undefined;
	while (true) {
		await new Promise<void>((resolve) =>
			setTimeout(
				resolve,
				randomWithin(expectedAfter, expectedAfter + ttl / 2) * 1000,
			),
		);

		try {
			console.info(`[worker-${id}/*] request`);

			const response = await fetch(url, {
				method: "POST",
				body,
				headers: {
					"content-type": "application/json",
					"user-agent": "home-assistant/1",
					...(typeof submissionIdentifier !== "undefined"
						? {
								"x-device-database-submission-identifier": submissionIdentifier,
							}
						: {}),
				},
			});

			if (!response.ok) {
				const received = await response.text();
				console.error(`[worker-${id}/!] received error <${received}>`);
				continue;
			}

			const received = await response.json();
			if (
				typeof received !== "object" ||
				received === null ||
				!("submission_identifier" in received)
			) {
				console.error(`[worker-${id}/!] submission identifier not returned`);
				continue;
			}

			submissionIdentifier = received.submission_identifier as string;
		} catch (e) {
			console.error(`[worker-${id}/!] request error`);
			console.error(e);
		}
	}
}
