import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { addMinutes } from "date-fns";
import type { PickDeep } from "type-fest";

import { logger as parentLogger } from "../../logger";
import { isNone } from "../../type/maybe";
import {
	LockFile,
	LockFileAcquiredByOtherProcessError,
} from "../../utility/lockfile";
import { Config } from "../config/config.module";
import { DatabaseStaging } from "./database.module";

import type { IDatabase } from "../../service/database";

const logger = parentLogger.child({ label: "lockfile-coordinator" });

@Injectable()
export class ServiceLockfileCoordinator implements OnApplicationShutdown {
	// initialized with promise that never resolves to prevent potential race until actual
	// promise is assigned on bootstrap
	public readonly _unlocked: Promise<void>;

	private lockfile: LockFile | undefined;

	constructor(
		@Inject(Config)
		private readonly config: PickDeep<Config, "initiallyConcurrent">,
		@Inject(DatabaseStaging) db: IDatabase<"staging">,
	) {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this._unlocked = promise;

		// always unlocked when not initially concurrent or when operating on in-memory database
		if (!this.config.initiallyConcurrent) {
			resolve();
			return;
		}

		const databaseLocation = db.raw.location();
		if (
			// no open file handles can exist for in-memory database
			isNone(databaseLocation)
		) {
			resolve();
			return;
		}

		const lockfile = new LockFile(
			join(dirname(databaseLocation), "staging-lock"),
		);

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

		this.lockfile = lockfile;
	}

	async onApplicationShutdown(): Promise<void> {
		this.lockfile?.release();
	}

	/** resolves when lockfile is successfully acquired */
	get unlocked(): Promise<void> {
		return this._unlocked;
	}
}
