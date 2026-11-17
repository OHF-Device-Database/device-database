import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** probes a freshly brought up watch this often until it reports */
const probeEvery = 250;
/** gives up on a watch that has not reported within this */
const probeWithin = 5_000;

/**
 * `watch` doesn't immediately start reporting, every event until then is dropped
 * → fabricate events in `root` until one is reported back
 */
export const probeWatch = (
	root: string,
	every = probeEvery,
	within = probeWithin,
) => {
	/** reassigned per attempt, so that it resolves the one currently in flight */
	let report = (): void => {};

	return {
		report: (): void => report(),
		/** must only be called once the watch is up */
		probe: async (): Promise<boolean> => {
			const path = join(root, `.probe-${randomUUID()}`);

			for (let attempt = 0; attempt < within / every; attempt += 1) {
				let landed = false;
				const settled = new Promise<void>((resolve) => {
					report = () => {
						landed = true;
						resolve();
					};
					void sleep(every).then(resolve);
				});

				await writeFile(path, "");
				await rm(path, { force: true });

				await settled;

				if (landed) {
					return true;
				}
			}

			return false;
		},
	};
};

/** whether filesystem watching reports at all below `root` */
export const workingWatch = async (root: string): Promise<boolean> => {
	const directory = await mkdtemp(join(root, "watch-probe-"));

	try {
		const { report, probe } = probeWatch(directory);

		// `persistent: false` → don't keep process alive
		const watcher = watch(directory, { persistent: false }, () => report());
		watcher.on("error", () => {});

		try {
			return await probe();
		} finally {
			watcher.close();
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};
