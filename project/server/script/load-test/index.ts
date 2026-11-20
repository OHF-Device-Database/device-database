import { spawn } from "node:child_process";
import { constants, rmSync } from "node:fs";
import { copyFile, glob, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { clearInterval, setInterval, setTimeout } from "node:timers";
import { parseArgs } from "node:util";
import { isMainThread, Worker, workerData } from "node:worker_threads";

import { Agent, fetch, setGlobalDispatcher } from "undici";

const expectedAfter = 3;
const ttl = 2;

const randomWithin = (min: number, max: number) =>
	Math.random() * (max - min) + min;

if (isMainThread) {
	const {
		values: { "database-template": databaseTemplate },
		values,
	} = parseArgs({
		options: {
			snapshots: { type: "string" },
			workers: { type: "string" },
			"database-template": { type: "string" },
			"no-server-stdout": { type: "boolean" },
			"no-server-stderr": { type: "boolean" },
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
	const databaseDomainStaging = join(databaseDirectory, "staging");
	const databaseStaging = join(databaseDomainStaging, "initial", "db");

	process.on("exit", () => {
		rmSync(databaseDirectory, { force: true, recursive: true });
		console.log("deleted temporary directory");
	});

	// released in reverse order of registration on SIGINT, temporary directory is removed on exit
	// a second SIGINT skips straight to exit
	const teardown: (() => unknown)[] = [];
	let tearingDown = false;
	process.on("SIGINT", async () => {
		if (tearingDown) {
			process.exit(1);
		}
		tearingDown = true;

		for (const release of teardown.toReversed()) {
			await release();
		}

		process.exit();
	});

	if (typeof databaseTemplate !== "undefined") {
		await mkdir(dirname(databaseStaging), { recursive: true });
		await copyFile(
			databaseTemplate,
			databaseStaging,
			constants.COPYFILE_FICLONE,
		);
	}

	console.info(`database directory: <${databaseDirectory}>`);
	console.info(`server port: <${port}>`);

	const spawned = spawn(
		"make",
		["--directory", join(import.meta.dirname, "..", ".."), "start-nest"],
		{
			env: {
				PORT: String(port),
				EXTERNAL_AUTHORITY: `localhost:${port}`,
				EXTERNAL_SECURE: "false",
				SECURE: "false",
				DATABASE_DOMAIN_STAGING_PATH: databaseDomainStaging,
				DATABASE_DOMAIN_DERIVED_PATH: join(databaseDirectory, "derived"),
				SNAPSHOT_VOUCHER_EXPECTED_AFTER: String(expectedAfter),
				SNAPSHOT_VOUCHER_TTL: String(ttl),
				INSPECT: "true",
				...process.env,
			},
			detached: true,
		},
	);
	{
		const signal = (signal: NodeJS.Signals) => {
			try {
				process.kill(-(spawned.pid as number), signal);
			} catch {}
		};
		const exited = new Promise((resolve) => spawned.once("exit", resolve));

		teardown.push(async () => {
			// make only exits once the server it runs has
			signal("SIGINT");
			const timeout = setTimeout(() => {
				console.warn("server did not shut down in time, killing");
				signal("SIGKILL");
			}, 10_000);
			await exited;
			clearTimeout(timeout);
		});
		// whatever is left of the group must not outlive this process, nor the temporary directory
		process.prependListener("exit", () => signal("SIGKILL"));
	}

	{
		const rl = createInterface({
			input: spawned.stdout,
			crlfDelay: Infinity,
		});

		rl.on("line", (line) => {
			if (!values["no-server-stdout"]) {
				process.stdout.write(`[server/*] ${line}\n`);
			}
		});
	}

	{
		const rl = createInterface({
			input: spawned.stderr,
			crlfDelay: Infinity,
		});

		rl.on("line", (line) => {
			if (!values["no-server-stderr"]) {
				process.stderr.write(`[server/!] ${line}\n`);
			}
		});
	}

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

	for (let i = 0; i < workerCount; i++) {
		const snapshot = snapshots[i % snapshots.length];
		const worker = new Worker(import.meta.filename, {
			workerData: {
				id: i,
				snapshot,
				url: `http://127.0.0.1:${port}/api/v1/snapshot/1`,
			},
		});
		teardown.push(() => worker.terminate());
	}

	const metricsInterval = setInterval(async () => {
		for (const registry of ["global", "local"]) {
			try {
				const started = performance.now();
				const response = await fetch(
					`http://127.0.0.1:${port}/metrics/${registry}`,
				);
				const received = await response.text();
				if (!response.ok) {
					console.error(`[metrics/!] ${registry} received error <${received}>`);
					continue;
				}

				console.info(
					`[metrics/*] ${registry} ${(performance.now() - started).toFixed(0)}ms`,
				);
			} catch (e) {
				console.error(`[metrics/!] ${registry} request error`);
				console.error(e);
			}
		}
	}, 30_000);
	teardown.push(() => clearInterval(metricsInterval));
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
