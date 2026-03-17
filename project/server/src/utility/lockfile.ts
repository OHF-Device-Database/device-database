import { EEXIST, ENOENT } from "node:constants";
import { type FileHandle, open, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { isNone } from "../type/maybe";

type LockFileConfiguration = {
	staleMs?: number;
	updateIntervalMs?: number;
};

export class LockFileAcquiredByOtherProcessError extends Error {
	constructor(options?: { cause?: unknown }) {
		super("lockfile acquired by other process", options);
		Object.setPrototypeOf(this, LockFileAcquiredByOtherProcessError.prototype);
	}
}

export class LockFileAlreadyReleasedError extends Error {
	constructor() {
		super("lockfile already released");
		Object.setPrototypeOf(this, LockFileAlreadyReleasedError.prototype);
	}
}

/** _good enough_ lockfile implementation
 *
 * zero-downtime deploys require temporarily running two instances side-by-side
 * if those instances happen to be writers, the newly spawned instances should wait for the
 * old instance to be terminated before performing writes, to prevent busy timeout errors and
 * potential races
 *
 * including an implementation that is tailored towards that particular use-case, as already
 * existing lockfile solutions (e.g. npm/lockfile or moxystudio/node-proper-lockfile)
 * are in pretty bad shape */
export class LockFile {
	private lockPath: string;
	private handle: FileHandle | null = null;
	private timer: NodeJS.Timeout | null = null;

	private staleMs: number;
	private updateIntervalMs: number;

	constructor(path: string, configuration?: LockFileConfiguration) {
		this.lockPath = resolve(path);
		// stale after 10s
		this.staleMs = configuration?.staleMs ?? 10_000;
		// heartbeat every 2s
		this.updateIntervalMs = configuration?.updateIntervalMs ?? 2_000;
	}

	async acquire(): Promise<void> {
		let handle;
		try {
			handle = await open(
				this.lockPath,
				// fails if path exists
				"wx",
			);
		} catch (e) {
			// only suppress "file already exists" errors
			if (
				!(
					typeof e === "object" &&
					e !== null &&
					"errno" in e &&
					e.errno === -EEXIST
				)
			) {
				throw e;
			}

			const locked = await LockFile.locked(this.lockPath, this.staleMs);
			if (locked) {
				throw new LockFileAcquiredByOtherProcessError({ cause: e });
			}

			await LockFile.maybeUnlink(this.lockPath);
		}

		if (typeof handle === "undefined") {
			await sleep(Math.random() * 100);
			return await this.acquire();
		}

		this.handle = handle;
		this.timer = setInterval(async () => {
			const now = new Date();
			await handle.utimes(now, now);
		}, this.updateIntervalMs);
	}

	private static async locked(path: string, staleMs: number): Promise<boolean> {
		let s;
		try {
			s = await stat(path);
		} catch (e) {
			// file does not exist → consider unlocked
			if (
				typeof e === "object" &&
				e !== null &&
				"errno" in e &&
				e.errno === -ENOENT
			) {
				return false;
			}

			throw e;
		}

		return Date.now() - staleMs < s.mtimeMs;
	}

	private static async maybeUnlink(path: string) {
		try {
			await unlink(path);
		} catch (e) {
			// suppress "file does not exist" error while rethrowing others
			if (
				!(
					typeof e === "object" &&
					e !== null &&
					"errno" in e &&
					e.errno === -ENOENT
				)
			) {
				throw e;
			}
		}
	}

	async release(idempotent = false): Promise<void> {
		if (isNone(this.handle) || isNone(this.timer)) {
			if (idempotent) {
				return;
			}

			throw new LockFileAlreadyReleasedError();
		}

		const handle = this.handle;
		const timer = this.timer;

		this.handle = null;
		this.timer = null;

		clearInterval(timer);
		await handle.close();

		await LockFile.maybeUnlink(this.lockPath);
	}

	[Symbol.asyncDispose] = async () => {
		await this.release(true);
	};
}
