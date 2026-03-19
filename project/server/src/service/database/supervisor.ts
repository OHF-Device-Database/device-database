import { on } from "node:events";
import { join, resolve } from "node:path";
import { env, hrtime } from "node:process";
import { type MessagePort, Worker } from "node:worker_threads";

import { logger as parentLogger } from "../../logger";
import { type Uuid, uuid } from "../../type/codec/uuid";
import { isNone, type Maybe } from "../../type/maybe";
import { formatNs } from "../../utility/format";
import { DatabaseMoreThanOneError, type DatabaseTransaction } from ".";

import type { IIntrospection } from "../introspect";
import type { DatabaseAttachmentDescriptor } from "./base";
import type { BoundQuery, ConnectionMode, ResultMode } from "./query";
import type { TransactionPortMessageRequest, WorkerData } from "./worker";

const workerPriority = ["default", "background"] as const;
export type SupervisorWorkerPriority = (typeof workerPriority)[number];
const isWorkerPriority = (arg: string): arg is SupervisorWorkerPriority =>
	(workerPriority as readonly string[]).includes(arg);

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

export class WorkerCrashedError extends Error {
	constructor(public cause: unknown) {
		super("worker crashed", { cause });
		Object.setPrototypeOf(this, WorkerCrashedError.prototype);
	}
}

type WorkTransaction<CM extends ConnectionMode, R> = {
	kind: "transaction";
	connectionMode: CM;
	fn: (
		t: DatabaseTransaction<string | undefined, CM extends "w" ? "r" | "w" : CM>,
	) => Promise<R>;
	resolve: (value: R) => void;
	reject: (value: unknown) => void;
};

type WorkQuery<CM extends ConnectionMode, R> = {
	kind: "query";
	bound: BoundQuery<string | undefined, ResultMode, CM, R>;
	resolve: (
		value: Promise<R | null> | AsyncIterable<R> | Promise<void>,
	) => void;
};

type Work<CM extends ConnectionMode, R> =
	| WorkTransaction<CM, R>
	| WorkQuery<CM, R>;

type Supervised = Record<SupervisorWorkerPriority, SupervisedWorker[]>;
type Queue = Record<
	SupervisorWorkerPriority,
	Record<ConnectionMode, Work<ConnectionMode, unknown>[]>
>;
type Idle = Record<
	SupervisorWorkerPriority,
	Record<ConnectionMode, Set<number>>
>;
type TookNsAverage = Map<string, bigint>;

const buildMetrics = (databaseName: string, introspection: IIntrospection) =>
	({
		queryHistogram: introspection.metric.histogram({
			name: `database_${databaseName}_query_duration_seconds`,
			help: "duration of database queries in seconds",
			labelNames: ["query", "worker"],
			buckets: [
				0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5,
				10,
			],
		}),

		queryCounter: introspection.metric.counter({
			name: `database_${databaseName}_queries_total`,
			help: "amount of database queries",
			labelNames: ["query", "worker"],
		}),
	}) as const;

type Metrics = ReturnType<typeof buildMetrics>;

export class Supervisor {
	private constructor(
		// holds indices of idle `supervised` entries
		private idle: Idle,
		private queue: Queue,
		private supervised: Supervised,
		/** once despawned, all further operations become unavailable */
		private abort: AbortController,
	) {}

	public static async build(
		databaseName: string | undefined,
		databasePath: string,
		pragmas: Record<string, string>,
		attached: Record<string, DatabaseAttachmentDescriptor>,
		workerCount: Record<SupervisorWorkerPriority, number>,
		// dependency injection doesn't work on parameters of static methods 🥲
		introspection: IIntrospection,
	): Promise<Supervisor> {
		const idle = Object.fromEntries(
			workerPriority.map(
				(
					priority,
				): [SupervisorWorkerPriority, Record<ConnectionMode, Set<number>>] => [
					priority,
					{
						w: new Set(),
						r: new Set(),
					},
				],
			),
		) as Idle;
		const queue = Object.fromEntries(
			workerPriority.map(
				(
					priority,
				): [
					SupervisorWorkerPriority,
					Record<ConnectionMode, Work<ConnectionMode, unknown>[]>,
				] => [
					priority,
					{
						w: [],
						r: [],
					},
				],
			),
		) as Queue;
		const supervised = Object.fromEntries(
			workerPriority.map(
				(priority): [SupervisorWorkerPriority, SupervisedWorker[]] => [
					priority,
					[],
				],
			),
		) as Supervised;
		const abort = new AbortController();

		const ctx = {
			databasePath,
			pragmas,
			attached,
			idle,
			queue,
			supervised,
			signal: abort.signal,
			metrics:
				typeof databaseName !== "undefined"
					? buildMetrics(databaseName, introspection)
					: undefined,
			tookNsAverage: new Map<string, bigint>(),
		};

		if (typeof databaseName !== "undefined") {
			introspection.metric.gauge(
				{
					name: `database_${databaseName}_queued_total`,
					help: "amount of queued work",
					labelNames: ["priority", "connection_mode"],
				},
				async (collector) => {
					for (const [priority, partitioned] of Object.entries(queue)) {
						for (const [connectionMode, queue] of Object.entries(partitioned)) {
							collector.set(
								{ priority, connection_mode: connectionMode },
								queue.length,
							);
						}
					}
				},
			);
		}

		for (const [priority, count] of Object.entries(workerCount)) {
			if (!isWorkerPriority(priority)) {
				continue;
			}

			for (let slot = 0; slot < count; slot++) {
				// first worker always in "w" connection mode, subsequent ones in "r"
				const connectionMode: ConnectionMode = slot === 0 ? "w" : "r";

				supervised[priority].push(
					await SupervisedWorker.supervise(
						connectionMode,
						databasePath,
						pragmas,
						attached,
						{
							done: Supervisor.doneFactory(priority, connectionMode, slot, ctx),
							error: Supervisor.errorFactory(
								priority,
								connectionMode,
								slot,
								ctx,
							),
							step: Supervisor.stepFactory(priority, connectionMode, slot, ctx),
						},
					),
				);
				idle[priority][connectionMode].add(slot);
			}

			logger.debug(
				`spawned ${count} <${priority}> workers for <${databasePath}>`,
				{
					count,
					priority,
					databasePath,
				},
			);
		}

		return new Supervisor(idle, queue, supervised, abort);
	}

	private slot(
		priority: SupervisorWorkerPriority,
		connectionMode: ConnectionMode,
	): Maybe<[pool: ConnectionMode, index: number]> {
		if (this.abort.signal.aborted) {
			throw new SupervisorDespawnedError();
		}

		let pool: ConnectionMode;
		if (this.supervised[priority].length === 1) {
			// use write worker for reads as well when there are no read workers (e.g. when testing)
			pool = "w";
		} else {
			pool = connectionMode;
		}

		const idle = [...this.idle[priority][pool].values()];

		const index = idle.at(0);
		if (typeof index === "undefined") {
			return null;
		}

		return [pool, index] as const;
	}

	public run<R>(
		bound: BoundQuery<string | undefined, ResultMode, ConnectionMode, R>,
		priority: SupervisorWorkerPriority = "default",
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		const { connectionMode } = bound;
		const slot = this.slot(priority, connectionMode);
		const enqueue = isNone(slot);

		if (!enqueue) {
			const [pool, index] = slot;
			// an appropriate worker is currently idle, run immediately
			this.idle[priority][pool].delete(index);
			return this.supervised[priority][index].run(bound);
		} else {
			switch (bound.resultMode) {
				case "one": {
					return (async () => {
						return new Promise<Promise<R | null>>((resolve) =>
							this.queue[priority][connectionMode].push({
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
							self.queue[priority][connectionMode].push({
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
							this.queue[priority][connectionMode].push({
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
		fn: (
			t: DatabaseTransaction<
				string | undefined,
				CM extends "w" ? "r" | "w" : CM
			>,
		) => Promise<R>,
		priority: SupervisorWorkerPriority = "default",
	): Promise<R> {
		const slot = this.slot(priority, connectionMode);
		const enqueue = isNone(slot);

		if (!enqueue) {
			const [pool, index] = slot;
			// an appropriate worker is currently idle, run immediately
			this.idle[priority][pool].delete(index);
			return this.supervised[priority][index].begin(connectionMode, fn);
		} else {
			// no appropriate worker is idle, put work into queue for worker to pick up later
			return new Promise<R>((resolve, reject) => {
				this.queue[priority][connectionMode].push({
					kind: "transaction",
					connectionMode,
					fn,
					// lower type
					resolve: resolve as (value: unknown) => void,
					reject,
				});
			});
		}
	}

	private static doneFactory(
		priority: SupervisorWorkerPriority,
		connectionMode: ConnectionMode,
		slot: number,
		ctx: {
			idle: Idle;
			queue: Queue;
			supervised: Supervised;
		},
	) {
		return (self: SupervisedWorker) => {
			const work =
				ctx.supervised[priority].length > 1
					? ctx.queue[priority][connectionMode].shift()
					: // use write worker for reads as well when there are no read workers (e.g. when testing)
						(ctx.queue[priority].r.shift() ?? ctx.queue[priority].w.shift());

			if (typeof work === "undefined") {
				ctx.idle[priority][connectionMode].add(slot);
				return;
			}

			switch (work.kind) {
				case "transaction":
					self
						.begin(work.connectionMode, work.fn)
						.then((value) => work.resolve(value))
						.catch((err) => work.reject(err));
					break;
				case "query":
					work.resolve(self.run(work.bound));
			}
		};
	}

	private static errorFactory(
		priority: SupervisorWorkerPriority,
		connectionMode: ConnectionMode,
		slot: number,
		ctx: {
			databasePath: string;
			pragmas: Record<string, string>;
			attached: Record<string, DatabaseAttachmentDescriptor>;
			idle: Idle;
			queue: Queue;
			supervised: Supervised;
			signal: AbortSignal;
			metrics: Metrics | undefined;
			tookNsAverage: TookNsAverage;
		},
	) {
		return () => {
			if (ctx.signal.aborted) {
				return;
			}

			void SupervisedWorker.supervise(
				connectionMode,
				ctx.databasePath,
				ctx.pragmas,
				ctx.attached,
				{
					done: Supervisor.doneFactory(priority, connectionMode, slot, ctx),
					error: Supervisor.errorFactory(priority, connectionMode, slot, ctx),
					step: Supervisor.stepFactory(priority, connectionMode, slot, ctx),
				},
			).then((worker) => {
				ctx.supervised[priority][slot] = worker;

				// work might get enqueue in the time between a worker going down, and consequently becoming available again
				// if there are no other workers available during that timespan, work will never be picked up
				// → attempt to pick up work right after coming up
				Supervisor.doneFactory(priority, connectionMode, slot, ctx)(worker);
			});
		};
	}

	private static stepFactory(
		priority: SupervisorWorkerPriority,
		connectionMode: ConnectionMode,
		slot: number,
		ctx: {
			metrics: Metrics | undefined;
			tookNsAverage: TookNsAverage;
		},
	) {
		return (
			bound: BoundQuery<
				string | undefined,
				ResultMode,
				ConnectionMode,
				unknown
			>,
		) => {
			const tookNsAverage = ctx.tookNsAverage.get(bound.name);

			let timeout: [handle: NodeJS.Timeout, trace: Uuid];
			let late = false;
			timeout: {
				if (typeof tookNsAverage === "undefined") {
					break timeout;
				}

				// clamp to > 10 milliseconds, otherwise _way_ too noisy
				const clampedTookNsAverage =
					tookNsAverage < 10_000_000n ? 10_000_000n : tookNsAverage;

				// allow up to 2x duration
				const delay = Number(clampedTookNsAverage / 1_000_000n) * 2;

				const trace = uuid();

				timeout = [
					setTimeout(() => {
						late = true;
						logger.debug(
							`query <${bound.name}> is taking longer than expected`,
							{
								expected: formatNs(tookNsAverage),
								priority,
								connectionMode,
								slot,
								tookNsAverage,
								parameters: bound.parameters,
								trace,
							},
						);
					}, delay),
					trace,
				];
			}

			return (tookNs: bigint) => {
				if (typeof timeout !== "undefined") {
					const [handle, trace] = timeout;

					clearTimeout(handle);

					if (late) {
						logger.debug(
							`query <${bound.name}> finished late (${formatNs(tookNs)}s)`,
							{
								took: tookNs,
								priority,
								connectionMode,
								slot,
								trace,
							},
						);
					}
				}

				ctx.tookNsAverage.set(
					bound.name,
					typeof tookNsAverage !== "undefined"
						? (tookNsAverage + tookNs) / 2n
						: tookNs,
				);

				if (typeof ctx.metrics === "undefined") {
					return;
				}

				const labels = {
					query: bound.name,
					worker: `${priority}-${connectionMode}-${slot}`,
				} as const;

				ctx.metrics.queryHistogram.observe(
					labels,
					Number(tookNs / 1_000_000n) / 1_000,
				);
				ctx.metrics.queryCounter.increment(labels);
			};
		};
	}

	async despawn() {
		this.abort.abort();
		await Promise.all(
			Object.values(this.supervised).flatMap((workers) =>
				workers.map((worker) => worker.despawn()),
			),
		);
	}
}

class SupervisedWorker {
	private abort = new AbortController();

	private static async buildWorker(
		connectionMode: ConnectionMode,
		databasePath: string,
		pragmas: Record<string, string>,
		attached: Record<string, DatabaseAttachmentDescriptor>,
	): Promise<Worker> {
		const worker = new Worker(workerPath, {
			workerData: {
				connectionMode,
				databasePath,
				pragmas,
				attached,
			} satisfies WorkerData,
		});

		return await new Promise<Worker>((resolve) =>
			worker.once("online", () => resolve(worker)),
		);
	}

	public static async supervise(
		connectionMode: ConnectionMode,
		databasePath: string,
		pragmas: Record<string, string>,
		attached: Record<string, DatabaseAttachmentDescriptor>,
		lifecycle: {
			done: (self: SupervisedWorker) => void;
			error: () => void;
			step: (
				query: BoundQuery<
					string | undefined,
					ResultMode,
					ConnectionMode,
					unknown
				>,
			) => (took: bigint) => void;
		},
	): Promise<SupervisedWorker> {
		const worker = await SupervisedWorker.buildWorker(
			connectionMode,
			databasePath,
			pragmas,
			attached,
		);

		return new SupervisedWorker(worker, lifecycle);
	}

	private constructor(
		private readonly worker: Worker,
		private readonly lifecycle: {
			done: (self: SupervisedWorker) => void;
			error: () => void;
			step: (
				query: BoundQuery<
					string | undefined,
					ResultMode,
					ConnectionMode,
					unknown
				>,
			) => (took: bigint) => void;
		},
	) {
		this.worker.once("error", (error) => {
			this.abort.abort(error);
			this.lifecycle.error();
		});
	}

	private buildRun<R>(
		bound: BoundQuery<string | undefined, ResultMode, ConnectionMode, R>,
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

		switch (bound.resultMode) {
			case "one": {
				return (async () => {
					const iterable = on(port, "message", options);
					const row = await iterable.next();

					// `next` returns `{ value: undefined, done: true }` if an error occurred → check reason
					// before branch below executes
					if (signal.aborted) {
						throw new WorkerCrashedError(signal.reason);
					}

					let result;
					if (row.done) {
						result = null;
					} else {
						// has to be completely exhaused when inserting / updating / deleting
						const { done } = await iterable.next();
						if (!done) {
							port.close();
							throw new DatabaseMoreThanOneError(
								bound as BoundQuery<
									string | undefined,
									"one",
									ConnectionMode,
									R
								>,
							);
						}

						result = row.value[0];
					}

					await postflight?.();

					return result;
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
						if (signal.aborted) {
							// biome-ignore lint/correctness/noUnsafeFinally: ↑
							throw new WorkerCrashedError(signal.reason);
						}

						await postflight?.();
					}
				})() as AsyncIterable<R>;
			}
			case "none": {
				return (async () => {
					await new Promise<void>((resolve) => port.once("close", resolve));

					if (signal.aborted) {
						throw new WorkerCrashedError(signal.reason);
					}

					await postflight?.();
				})() as Promise<void>;
			}
		}
	}

	run<R>(
		bound: BoundQuery<string | undefined, ResultMode, ConnectionMode, R>,
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		const { port1: transactionPortSend, port2: transactionPortRecv } =
			new MessageChannel();

		this.worker.postMessage(
			[
				// single statements don't need to be wrapped in transactions
				"none",
				transactionPortRecv,
			],
			[transactionPortRecv],
		);

		const { port1, port2 } = new MessageChannel();

		const message: TransactionPortMessageRequest = {
			kind: "query",
			bound,
			port: port2,
		};

		transactionPortSend.postMessage(message, [port2]);

		const start = hrtime.bigint();
		const stepped = this.lifecycle.step(bound);
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

			this.lifecycle.done(this);
			stepped(hrtime.bigint() - start);
		});
	}

	async begin<R>(
		connectionMode: ConnectionMode,
		fn: (t: DatabaseTransaction<string, ConnectionMode>) => Promise<R>,
	): Promise<R> {
		const { port1: transactionPortSend, port2: transactionPortRecv } =
			new MessageChannel();

		this.worker.postMessage(
			[
				// writers can accept read-only transactions when no readers are available
				connectionMode === "w" ? "immediate" : "deferred",
				transactionPortRecv,
			],
			[transactionPortRecv],
		);

		const t: DatabaseTransaction<string, ConnectionMode> = {
			run: (<R>(
				bound: BoundQuery<string | undefined, ResultMode, ConnectionMode, R>,
			) => {
				const { port1, port2 } = new MessageChannel();

				const message: TransactionPortMessageRequest = {
					kind: "query",
					bound,
					port: port2,
				};

				transactionPortSend.postMessage(message, [port2]);

				const start = hrtime.bigint();
				const stepped = this.lifecycle.step(bound);
				return this.buildRun(bound, port1, async () => {
					stepped(hrtime.bigint() - start);
				});
			}) as DatabaseTransaction<string, ConnectionMode>["run"],
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
				this.lifecycle.done(this);
			}
		}

		return result;
	}

	async despawn() {
		this.abort.abort();
		await this.worker.terminate();
	}
}
