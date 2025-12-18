import { on } from "node:events";
import { join, resolve } from "node:path";
import { env, hrtime } from "node:process";
import { type MessagePort, Worker } from "node:worker_threads";

import { logger as parentLogger } from "../../logger";
import { formatNs } from "../../utility/format";
import { DatabaseMoreThanOneError, type DatabaseTransaction } from ".";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";
import type { TransactionPortMessageRequest, WorkerData } from "./worker";

const testing = "NODE_TEST_CONTEXT" in env;

const workerPath = resolve(
	join(
		!testing ? import.meta.dirname : join("out", "server"),
		"worker-database.mjs",
	),
);

const logger = parentLogger.child({ label: "database-supervisor" });

export class SupervisorDespawnedError extends Error {
	constructor() {
		super("supervisor despawned");
		Object.setPrototypeOf(this, SupervisorDespawnedError.prototype);
	}
}

type WorkTransaction<CM extends ConnectionMode, R> = {
	kind: "transaction";
	fn: (t: DatabaseTransaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>;
	resolve: (value: R) => void;
	reject: (value: unknown) => void;
};

type WorkQuery<CM extends ConnectionMode, R> = {
	kind: "query";
	bound: BoundQuery<ResultMode, CM, R>;
	resolve: (
		value: Promise<R | null> | AsyncIterable<R> | Promise<void>,
	) => void;
};

type Work<CM extends ConnectionMode, R> =
	| WorkTransaction<CM, R>
	| WorkQuery<CM, R>;

type Supervised = SupervisedWorker[];
type Queue = Record<ConnectionMode, Work<ConnectionMode, unknown>[]>;
type Idle = Record<ConnectionMode, Set<number>>;

export class Supervisor {
	private constructor(
		// holds indices of idle `supervised` entries
		private idle: Record<ConnectionMode, Set<number>>,
		private queue: Queue,
		private supervised: Supervised,
		/** once despawned, all further operations become unavailable */
		private abort: AbortController,
	) {}

	public static async build(
		databasePath: string,
		pragmas: Record<string, string>,
		workerCount: number,
	): Promise<Supervisor> {
		const idle: Idle = {
			w: new Set(),
			r: new Set(),
		};
		const queue: Queue = {
			w: [],
			r: [],
		};
		const supervised: Supervised = [];
		const abort = new AbortController();

		const ctx = {
			databasePath,
			pragmas,
			idle,
			queue,
			supervised,
			signal: abort.signal,
		};

		for (let i = 0; i < workerCount; i++) {
			// first worker always in "w" connection mode, subsequent ones in "r"
			const connectionMode: ConnectionMode = i === 0 ? "w" : "r";

			supervised.push(
				await SupervisedWorker.supervise(
					connectionMode,
					i,
					databasePath,
					pragmas,
					Supervisor.doneHandler(i, connectionMode, ctx),
					Supervisor.errorHandler(i, connectionMode, ctx),
				),
			);
			idle[connectionMode].add(i);
		}

		logger.debug(`spawned ${workerCount} workers`, { workerCount });

		return new Supervisor(idle, queue, supervised, abort);
	}

	private slot(connectionMode: ConnectionMode): number | undefined {
		if (this.abort.signal.aborted) {
			throw new SupervisorDespawnedError();
		}

		let idle;
		if (this.supervised.length === 1) {
			// use write worker for reads as well when there are no read workers (e.g. when testing)
			idle = [...this.idle.w.values()];
		} else {
			idle = [...this.idle[connectionMode].values()];
		}

		return idle.at(0);
	}

	public run<R>(
		bound: BoundQuery<ResultMode, ConnectionMode, R>,
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		const { connectionMode } = bound;
		const slot = this.slot(connectionMode);
		const enqueue = typeof slot === "undefined";

		if (!enqueue) {
			// an appropriate worker is currently idle, run immediately
			this.idle[connectionMode].delete(slot);
			return this.supervised[slot].run(bound);
		} else {
			switch (bound.resultMode) {
				case "one": {
					return (async () => {
						return new Promise<Promise<R | null>>((resolve) =>
							this.queue[connectionMode].push({
								kind: "query",
								bound,
								// lower type
								resolve: resolve as (value: unknown) => void,
							}),
						);
					})();
				}
				case "many": {
					const self = this;
					return (async function* f() {
						yield* await new Promise<AsyncIterable<R>>((resolve) =>
							self.queue[connectionMode].push({
								kind: "query",
								bound,
								// lower type
								resolve: resolve as (value: unknown) => void,
							}),
						);
					})() as AsyncIterable<R>;
				}
				case "none": {
					return (async () => {
						return new Promise<Promise<void>>((resolve) =>
							this.queue[connectionMode].push({
								kind: "query",
								bound,
								// lower type
								resolve: resolve as (value: unknown) => void,
							}),
						);
					})() as Promise<void>;
				}
			}
		}
	}

	async begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (t: DatabaseTransaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>,
	): Promise<R> {
		const slot = this.slot(connectionMode);
		const enqueue = typeof slot === "undefined";

		if (!enqueue) {
			// an appropriate worker is currently idle, run immediately
			this.idle[connectionMode].delete(slot);
			return this.supervised[slot].begin(fn);
		} else {
			// no appropriate worker is idle, put work into queue for worker to pick up later
			return new Promise<R>((resolve, reject) => {
				this.queue[connectionMode].push({
					kind: "transaction",
					fn,
					// lower type
					resolve: resolve as (value: unknown) => void,
					reject,
				});
			});
		}
	}

	private static doneHandler(
		index: number,
		connectionMode: ConnectionMode,
		ctx: {
			idle: Idle;
			queue: Queue;
			supervised: Supervised;
		},
	) {
		return (self: SupervisedWorker) => {
			const work =
				ctx.supervised.length > 1
					? ctx.queue[connectionMode].shift()
					: // use write worker for reads as well when there are no read workers (e.g. when testing)
						(ctx.queue.r.shift() ?? ctx.queue.w.shift());

			if (typeof work === "undefined") {
				ctx.idle[connectionMode].add(index);
				return;
			}

			switch (work.kind) {
				case "transaction":
					self
						.begin(work.fn)
						.then((value) => work.resolve(value))
						.catch((err) => work.reject(err));
					break;
				case "query":
					work.resolve(self.run(work.bound));
			}
		};
	}

	private static errorHandler(
		index: number,
		connectionMode: ConnectionMode,
		ctx: {
			databasePath: string;
			pragmas: Record<string, string>;
			idle: Idle;
			queue: Queue;
			supervised: Supervised;
			signal: AbortSignal;
		},
	) {
		return (error: unknown) => {
			if (ctx.signal.aborted) {
				return;
			}

			logger.error("worker crashed");
			if (logger.isErrorEnabled()) {
				console.error(error);
			}

			void SupervisedWorker.supervise(
				connectionMode,
				index,
				ctx.databasePath,
				ctx.pragmas,
				Supervisor.doneHandler(index, connectionMode, ctx),
				Supervisor.errorHandler(index, connectionMode, ctx),
			).then((worker) => {
				ctx.supervised[index] = worker;

				// work might get enqueue in the time between a worker going down, and consequently becoming available again
				// if there are no other workers available during that timespan, work will never be picked up
				// → attempt to pick up work right after coming up
				Supervisor.doneHandler(index, connectionMode, ctx)(worker);
			});
		};
	}

	async despawn() {
		this.abort.abort();
		await Promise.all(this.supervised.map((worker) => worker.despawn()));
	}
}

class SupervisedWorker {
	private abort = new AbortController();

	private static async buildWorker(
		connectionMode: ConnectionMode,
		databasePath: string,
		pragmas: Record<string, string>,
	): Promise<Worker> {
		const worker = new Worker(workerPath, {
			workerData: {
				connectionMode,
				databasePath,
				pragmas,
			} satisfies WorkerData,
		});

		return await new Promise<Worker>((resolve) =>
			worker.once("online", () => resolve(worker)),
		);
	}

	public static async supervise(
		connectionMode: ConnectionMode,
		id: number,
		databasePath: string,
		pragmas: Record<string, string>,
		done: (self: SupervisedWorker) => void,
		error: (value: unknown) => void,
	): Promise<SupervisedWorker> {
		const worker = await SupervisedWorker.buildWorker(
			connectionMode,
			databasePath,
			pragmas,
		);

		return new SupervisedWorker(worker, `${connectionMode}-${id}`, done, error);
	}

	private constructor(
		private worker: Worker,
		private name: string,
		private done: (self: SupervisedWorker) => void,
		private error: (error: unknown) => void,
	) {
		this.worker.once("error", (error) => {
			this.abort.abort(error);
			this.error(error);
		});
	}

	private buildRun<R>(
		bound: BoundQuery<ResultMode, ConnectionMode, R>,
		port: MessagePort,
		postflight?: () => Promise<void>,
	) {
		const signal = this.abort.signal;

		// https://nodejs.org/docs/latest/api/events.html#eventsonemitter-eventname-options
		const options = {
			close: ["close"],
			// if an exception occurs within the worker, the "error" event is fired on the worker itself
			// logic in the constructor triggers the `AbortSignal`
			abort: signal,
		};

		const start = hrtime.bigint();
		const name = this.name;

		logger.debug(`(→) <${bound.name}>`, {
			query: bound.name,
			worker: name,
		});

		switch (bound.resultMode) {
			case "one": {
				return (async () => {
					const iterable = on(port, "message", options);
					const row = await iterable.next();

					// `next` returns `{ value: undefined, done: true }` if an error occurred → check reason
					// before branch below executes
					signal.throwIfAborted();

					if (row.done) {
						return null;
					} else {
						// has to be completely exhaused when inserting / updating / deleting
						const { done } = await iterable.next();
						if (!done) {
							port.close();
							throw new DatabaseMoreThanOneError(
								bound as BoundQuery<"one", ConnectionMode, R>,
							);
						}
					}

					await postflight?.();

					const took = hrtime.bigint() - start;
					logger.debug(`(←) <${bound.name}> in ${formatNs(took)}s`, {
						query: bound.name,
						took,
						worker: name,
					});

					return row.value[0];
				})() as Promise<R | null>;
			}
			case "many": {
				return (async function* f() {
					try {
						for await (const event of on(port, "message", options)) {
							for (const row of event) {
								yield row;
							}
						}
					} finally {
						// need to be in `finally` block in case iteration is stopped prematurely
						signal.throwIfAborted();

						await postflight?.();

						const took = hrtime.bigint() - start;
						logger.debug(`(←) <${bound.name}> in ${formatNs(took)}s`, {
							query: bound.name,
							took,
							worker: name,
						});
					}
				})() as AsyncIterable<R>;
			}
			case "none": {
				return (async () => {
					await new Promise<void>((resolve) => port.once("close", resolve));

					signal.throwIfAborted();

					await postflight?.();

					const took = hrtime.bigint() - start;
					logger.debug(`(←) <${bound.name}> in ${formatNs(took)}s`, {
						query: bound.name,
						took,
						name,
					});
				})() as Promise<void>;
			}
		}
	}

	run<R>(
		bound: BoundQuery<ResultMode, ConnectionMode, R>,
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		const { port1: transactionPortSend, port2: transactionPortRecv } =
			new MessageChannel();

		this.worker.postMessage(transactionPortRecv, [transactionPortRecv]);

		const { port1, port2 } = new MessageChannel();

		const message: TransactionPortMessageRequest = {
			kind: "query",
			bound,
			port: port2,
		};

		transactionPortSend.postMessage(message, [port2]);

		return this.buildRun(bound, port1, async () => {
			const message: TransactionPortMessageRequest = {
				kind: "done",
				rollback: false,
			};

			transactionPortSend.postMessage(message);

			// wait for commit / rollback to occur before returning
			await new Promise((resolve) =>
				transactionPortSend.once("close", resolve),
			);

			this.done(this);
		});
	}

	async begin<R>(
		fn: (t: DatabaseTransaction<ConnectionMode>) => Promise<R>,
	): Promise<R> {
		const { port1: transactionPortSend, port2: transactionPortRecv } =
			new MessageChannel();

		this.worker.postMessage(transactionPortRecv, [transactionPortRecv]);

		const t: DatabaseTransaction<ConnectionMode> = {
			run: (<R>(bound: BoundQuery<ResultMode, ConnectionMode, R>) => {
				const { port1, port2 } = new MessageChannel();

				const message: TransactionPortMessageRequest = {
					kind: "query",
					bound,
					port: port2,
				};

				transactionPortSend.postMessage(message, [port2]);

				return this.buildRun(bound, port1);
			}) as DatabaseTransaction<ConnectionMode>["run"],
		};

		let result;
		let rollback = false;
		try {
			result = await fn(t);
		} catch (e) {
			rollback = true;
			throw e;
		} finally {
			const message: TransactionPortMessageRequest = {
				kind: "done",
				rollback,
			};

			transactionPortSend.postMessage(message);

			// wait for commit / rollback to occur before returning
			await new Promise((resolve) =>
				transactionPortSend.once("close", resolve),
			);

			// abort signal is only toggled when a database error occurrs, in which case the
			// worker should go down
			// rejections that happen while the transaction function executes that are not database-related
			// do not bring down worker, which can therefor be marked idle again
			if (!this.abort.signal.aborted) {
				this.done(this);
			}
		}

		return result;
	}

	async despawn() {
		this.abort.abort();
		await this.worker.terminate();
	}
}
