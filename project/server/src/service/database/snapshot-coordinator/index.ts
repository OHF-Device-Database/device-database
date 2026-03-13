import { ENOENT } from "node:constants";
import type { Mode, PathLike } from "node:fs";
import { type FileHandle, open, rename, rm } from "node:fs/promises";

import { createType } from "@lppedd/di-wise-neo";

import type { Maybe } from "../../../type/maybe";
import type { IDatabase } from "../";
import type { DatabaseName } from "../base";

export interface IDatabaseSnapshotCoordinatorSuspendable {
	pause(): Promise<void>;
	resume(): void;
}

type FreshProgress = {
	originalSizeEstimate: number;
	currentSnapshotSize: number;
};

export interface IDatabaseSnapshotCoordinator {
	get destination(): string;

	// return value of AsyncIterable is not observable in `for await` loop → tagged union in `T` position
	fresh(): AsyncIterable<FreshProgress>;
	stale(): Promise<Maybe<FileHandle>>;
}

export const IDatabaseSnapshotCoordinator =
	createType<IDatabaseSnapshotCoordinator>("IDatabaseSnapshotCoordinator");

const RaceSentinel = Symbol("RaceSentinel");

// `FileHandle` does not expose that the underlying file descriptor has been closed → wrapper to manage closing
class FileHandleBox {
	private _closed: boolean = false;

	public static async new(
		path: PathLike,
		flags?: string | number,
		mode?: Mode,
	) {
		return new FileHandleBox(await open(path, flags, mode));
	}

	private constructor(private wrapped: FileHandle) {}

	public get handle(): Omit<FileHandle, "close"> {
		return this.wrapped;
	}

	public get closed(): boolean {
		return this._closed;
	}

	public async close() {
		if (this._closed) {
			return;
		}

		await this.wrapped.close();
		this._closed = true;
	}
}

type Running = {
	originalSizeEstimate: number;
	snapshot: Promise<void>;
	// assignment to `this.running` can't suspend, otherwise the "not set" branch
	// can be reached by multiple callers at once → store as promise that is awaited when observing
	handle: Promise<FileHandleBox>;
};

export class DatabaseSnapshotCoordinator
	implements IDatabaseSnapshotCoordinator
{
	// already running snapshot operation
	private running: Running | undefined;

	constructor(
		private database: IDatabase<DatabaseName>,
		private suspendable: IDatabaseSnapshotCoordinatorSuspendable,
		public readonly destination: string,
	) {}

	fresh(): AsyncIterable<FreshProgress> {
		let running: Running;
		if (typeof this.running === "undefined") {
			const tmpPath = `${this.destination}.tmp`;

			const handle = (async () => {
				await rm(tmpPath, { force: true });
				return await FileHandleBox.new(
					tmpPath,
					// creates file if it doesn't yet exist
					// required because snapshotting will only start _after_ handle has been acquired
					"a+",
				);
			})();

			running = {
				originalSizeEstimate: this.database.sizeEstimate,
				handle,
				snapshot: (async () => {
					// wait until temporary file has been removed
					await handle;

					await this.suspendable.pause();

					try {
						await this.database.snapshot(tmpPath);
						await rename(tmpPath, this.destination);
					} finally {
						this.suspendable.resume();
					}
				})(),
			};
			this.running = running;
		} else {
			running = this.running;
		}

		const { originalSizeEstimate, snapshot, handle } = running;
		return {
			[Symbol.asyncIterator]: () => {
				return {
					next: async () => {
						const h = await handle;

						// conclude the iterable
						if (h.closed) {
							return {
								value: undefined,
								done: true,
							};
						}

						const raced = await Promise.race([snapshot, RaceSentinel]);
						// snapshot completed
						if (raced !== RaceSentinel) {
							await h.close();
							this.running = undefined;

							return {
								value: undefined,
								done: true,
							};
						}

						const stat = await h.handle.stat();
						return {
							value: {
								originalSizeEstimate: originalSizeEstimate,
								currentSnapshotSize: stat.size,
							},
							done: false,
						};
					},
				};
			},
		};
	}

	async stale(): Promise<Maybe<FileHandle>> {
		// get file descriptor to prevent deletion from causing race between stat and opening stream
		let handle;
		try {
			handle = await open(this.destination, "r");
		} catch (e) {
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

		return handle ?? null;
	}
}
