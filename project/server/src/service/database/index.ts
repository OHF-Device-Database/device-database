import { ENOENT } from "node:constants";
import { stat, statfs } from "node:fs/promises";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { createType } from "@lppedd/di-wise-neo";

import { logger as parentLogger } from "../../logger";
import { isNone, type Maybe } from "../../type/maybe";
import { injectOrStub } from "../../utility/dependency-injection";
import { IIntrospection } from "../introspect";
import { StubIntrospection } from "../introspect/stub";
import {
	type DatabaseAttached,
	type DatabaseDescriptorBaked,
	type DatabaseName,
	isReadOnly,
	peek as peekDescriptor,
} from "./base";
import { DatabaseDomain, peek as peekGeneration } from "./domain";
import { stdLoad } from "./std";
import { Supervisor, type SupervisorWorkerPriority } from "./supervisor";

import type { DatabaseDomainGeneration } from "./domain";
import type { BoundQuery, ConnectionMode, Query, ResultMode } from "./query";

const logger = parentLogger.child({ label: "db" });

type Parameter = SQLInputValue;

type RunBehaviour = { returnBigInt?: boolean };

export type DatabaseTransaction<
	DB extends string | undefined,
	CM extends ConnectionMode,
> = {
	run<R>(bound: BoundQuery<DB, "one", CM, R>): Promise<R | null>;
	run<R>(bound: BoundQuery<DB, "many", CM, R>): AsyncIterable<R>;
	run<R>(bound: BoundQuery<DB, "none", CM, R>): Promise<void>;
};

export type IDatabase<DB extends DatabaseName | undefined> = {
	readonly name: DB;

	spawn(): Promise<void>;
	despawn(): Promise<void>;
	respawn(): Promise<void>;

	begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (
			t: DatabaseTransaction<DB, CM extends "w" ? "r" | "w" : CM>,
		) => Promise<R>,
		priority?: SupervisorWorkerPriority,
		name?: string,
	): Promise<R>;

	run<R>(
		bound: BoundQuery<DB, "one", ConnectionMode, R>,
		priority?: SupervisorWorkerPriority,
	): Promise<R | null>;
	run<R>(
		bound: BoundQuery<DB, "many", ConnectionMode, R>,
		priority?: SupervisorWorkerPriority,
	): AsyncIterable<R>;
	run<R>(
		bound: BoundQuery<DB, "none", ConnectionMode, R>,
		priority?: SupervisorWorkerPriority,
	): Promise<void>;

	/** renders command-line-interface style query plan */
	explain(bound: BoundQuery<DB, ResultMode, ConnectionMode, unknown>): string;

	raw: {
		exec(
			sql: string,
			namedParameters?: Record<string, Parameter>,
			...anonymousParameters: Parameter[]
		): void;
		query(
			sql: string,
			behaviour: { returnArray: false } & RunBehaviour,
			namedParameters: Record<string, Parameter>,
			...anonymousParameters: Parameter[]
		): Iterable<Record<string, unknown>>;
		query(
			sql: string,
			behaviour: { returnArray: true } & RunBehaviour,
			namedParameters: Record<string, Parameter>,
			...anonymousParameters: Parameter[]
		): Iterable<unknown>;
		location(dbName?: string): Maybe<string>;
		close(): void;
	};

	/**
	 * domains the connection reaches a database through, keyed by the name that database is
	 * attached under — `main` for the database itself
	 *
	 * a generation swapped in under any of them is only picked up on {@link respawn}
	 */
	get domains(): ReadonlyMap<string, DatabaseDomain>;

	assertHealthy(): Promise<void>;

	get sizeEstimate(): number;

	/** should not be called directly
	 * use an appropriate `IDatabaseSnapshotCoordinator` instead
	 */
	snapshot(destination: string): Promise<void>;
};

/** database laid out in a {@link DatabaseDomain} which can therefor be swapped to new generation*/
export type IDatabaseSwappable<DB extends DatabaseName | undefined> =
	IDatabase<DB> & {
		copy(
			pragmas?: Record<string, string>,
		): Promise<DatabaseSwappableGeneration<DB>>;
		swap(generation: DatabaseSwappableGeneration<DB>): Promise<void>;
	};

export const counted = <
	Q extends Query<
		string | undefined,
		"many",
		ConnectionMode,
		unknown,
		unknown,
		unknown,
		unknown,
		unknown,
		unknown
	>,
	CQ extends Q extends Query<
		infer DB,
		"many",
		infer CM,
		infer PN,
		infer PA,
		{ count: number },
		{ count: bigint },
		[number],
		[bigint]
	>
		? Query<
				DB,
				"one",
				CM,
				PN,
				PA,
				{ count: number },
				{ count: bigint },
				[number],
				[bigint]
			>
		: never,
>(
	query: Q,
): CQ =>
	({
		database: query.database,
		name: `Counted${query.name}`,
		query: `with q as (${query.query}) select count(1) as count from q`,
		bind: {
			named: (
				parameters,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			) => {
				const bound = query.bind.named(
					parameters,
					configuration as Parameters<(typeof query)["bind"]["named"]>[1],
				);
				return {
					...bound,
					name: `Counted${bound.name}`,
					query: `with q as (${bound.query}) select count(1) as count from q`,
					resultMode: "one",
				};
			},
			anonymous: (
				parameters,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			) => {
				const bound = query.bind.anonymous(
					parameters,
					configuration as Parameters<(typeof query)["bind"]["anonymous"]>[1],
				);
				return {
					...bound,
					name: `Counted${bound.name}`,
					query: `with q as (${bound.query}) select count(1) as count from q`,
					resultMode: "one",
				};
			},
		},
	}) as CQ;

export class DatabaseMoreThanOneError extends Error {
	constructor(
		public query: BoundQuery<
			string | undefined,
			"one",
			ConnectionMode,
			unknown
		>,
	) {
		super(`<${query.name}> query with "one" arity returned more than row`);
		Object.setPrototypeOf(this, DatabaseMoreThanOneError.prototype);
	}
}

export class DatabaseInMemorySpawnError extends Error {
	constructor() {
		super("spawn is not available for in-memory databases");
		Object.setPrototypeOf(this, DatabaseInMemorySpawnError.prototype);
	}
}

export class DatabaseInMemoryReopenError extends Error {
	constructor() {
		super("reopen is not available for in-memory databases");
		Object.setPrototypeOf(this, DatabaseInMemoryReopenError.prototype);
	}
}

export class DatabaseSupervisorUnavailableError extends Error {
	constructor() {
		super("supervisor unavailable, was it spawned?");
		Object.setPrototypeOf(this, DatabaseSupervisorUnavailableError.prototype);
	}
}

export class DatabaseReadOnlyDomainError extends Error {
	constructor(public root: string) {
		super(
			`<${root}> is opened read-only, generations are built by whoever owns it`,
		);
		Object.setPrototypeOf(this, DatabaseReadOnlyDomainError.prototype);
	}
}

const pragmas = {
	foreign_keys: "on",
	journal_mode: "wal",
	synchronous: "normal",
} as const;

/**
 * database to attach, either a plain file or a {@link DatabaseDomain} whose live generation is
 * attached
 */
export type DatabaseAttachment = DatabaseDescriptorBaked | DatabaseDomain;

/**
 * resolves an attachment into the descriptor it is opened through
 *
 * a domain is bootstrapped, so that its layout is in place before anything opens through it, and
 * reached through its `current` link rather than through whichever generation is live — SQLite
 * resolves the link on every open, so the attachment follows the domain across swaps
 *
 * whether the attachment is held to reads is the domain's call, a read-only one hands out a
 * read-only descriptor to everyone reaching through it
 */
const eraseAttachment = (
	attachment: DatabaseAttachment,
): DatabaseDescriptorBaked =>
	attachment instanceof DatabaseDomain
		? peekGeneration(attachment.bootstrap()).descriptor
		: attachment;

/**
 * swapping is driven by whatever built the generation rather than by a consumer resolving the
 * database, so the container only ever hands out the plain surface
 */
export const IDatabaseDerived =
	createType<IDatabase<"derived">>("IDatabaseDerived");
export const IDatabaseStaging =
	createType<IDatabase<"staging">>("IDatabaseStaging");

export class Database<DB extends DatabaseName | undefined>
	implements IDatabase<DB>
{
	private db: DatabaseSync;
	private descriptor: DatabaseDescriptorBaked;
	private pragmas: Record<string, string>;
	protected attached: Record<string, DatabaseDescriptorBaked>;
	/** backs {@link domains}, subclasses add the domain the database itself lives in */
	protected readonly reached: Map<string, DatabaseDomain>;

	private supervisor: Supervisor | undefined;
	/** in-flight {@link respawn} */
	private reopening: Promise<void> | undefined;

	constructor(
		public readonly name: DB,
		descriptor: DatabaseDescriptorBaked,
		attached: DB extends DatabaseName
			? Record<DatabaseAttached[DB][number], DatabaseAttachment>
			: Record<string, DatabaseAttachment>,
		/**
		 * workers {@link spawn} brings up per priority, retained so that {@link respawn} can bring
		 * the supervisor back up as it was
		 */
		protected readonly workerCount: Record<SupervisorWorkerPriority, number> = {
			default: 1,
			background: 1,
		},
		pragmaOverrides?: Record<string, string>,
		private introspection: IIntrospection = injectOrStub(
			IIntrospection,
			() => new StubIntrospection(),
		),
	) {
		this.descriptor = descriptor;
		this.pragmas = { ...pragmas, ...pragmaOverrides };

		// a read-only connection can't set journal mode
		if (isReadOnly(descriptor)) {
			delete this.pragmas.journal_mode;
		}
		this.reached = new Map(
			Object.entries(attached as Record<string, DatabaseAttachment>).filter(
				(entry): entry is [string, DatabaseDomain] =>
					entry[1] instanceof DatabaseDomain,
			),
		);
		this.attached = Object.fromEntries(
			Object.entries(attached as Record<string, DatabaseAttachment>).map(
				([name, attachment]) => [name, eraseAttachment(attachment)],
			),
		);
		this.db = this.open();

		introspection.metric.gauge(
			{
				name: `database_${name}_wal_size_total`,
				help: "size of database wal file",
				labelNames: [],
				registry: "global",
			},
			async (collector) => {
				const location = this.db.location();
				if (isNone(location)) {
					return;
				}

				let stats;
				try {
					stats = await stat(`${location}-wal`);
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

				if (typeof stats !== "undefined") {
					collector.set([], stats.size);
				}
			},
		);

		introspection.metric.gauge(
			{
				name: `database_${name}_filesystem_available_total`,
				help: "available space of filesystem that database is located on",
				labelNames: [],
				registry: "global",
			},
			async (collector) => {
				const location = this.db.location();
				if (isNone(location)) {
					return;
				}

				const stats = await statfs(location);
				collector.set([], stats.bsize * stats.bavail);
			},
		);

		introspection.metric.gauge(
			{
				name: `database_${name}_filesystem_capacity_total`,
				help: "total capacity of filesystem that database is located on",
				labelNames: [],
				registry: "global",
			},
			async (collector) => {
				const location = this.db.location();
				if (isNone(location)) {
					return;
				}

				const stats = await statfs(location);
				collector.set([], stats.bsize * stats.blocks);
			},
		);
	}

	/** opens a connection against the file the descriptor currently resolves to */
	private open(): DatabaseSync {
		const uri = new URL(peekDescriptor(this.descriptor));

		const db = new DatabaseSync(uri, {
			timeout: 5000,
		});
		stdLoad(db);

		logger.debug(`opened <${uri.pathname}>`, {
			path: uri.pathname,
			parameters: Object.fromEntries([...uri.searchParams.entries()]),
		});

		for (const [key, value] of Object.entries(this.pragmas)) {
			db.exec(`pragma ${key} = ${value}`);
		}

		for (const [name, descriptor] of Object.entries(this.attached)) {
			const prepared = db.prepare(`attach ? as ${name}`);
			prepared.run(peekDescriptor(descriptor));
		}

		return db;
	}

	async spawn(): Promise<void> {
		const location = this.db.location();
		if (isNone(location)) {
			throw new DatabaseInMemorySpawnError();
		}

		if (typeof this.supervisor !== "undefined") {
			return;
		}

		this.supervisor = await Supervisor.build(
			this.name,
			this.descriptor,
			this.pragmas,
			this.attached,
			this.workerCount,
			this.introspection,
		);

		logger.info(`spawned <${this.name ?? "-"}>`, {
			database: this.name,
			workerCount: this.workerCount,
		});
	}

	/**
	 * re-spawns database / re-spawns supervisor
	 *
	 * {@link run} + {@link begin} work waits for reopen to complete
	 *
	 * simultaneous calls are collapsed
	 */
	async respawn(): Promise<void> {
		if (typeof this.reopening !== "undefined") {
			return this.reopening;
		}

		if (isNone(this.db.location())) {
			throw new DatabaseInMemoryReopenError();
		}

		const reopening = (async () => {
			const supervisor = this.supervisor;
			if (typeof supervisor !== "undefined") {
				// in-flight work still reads the replaced file, let it finish first
				await supervisor.drained();
				await supervisor.despawn();
				this.supervisor = undefined;
			}

			this.db.close();
			this.db = this.open();

			/** supervisor is not spawned if it hasn't already been explicitly {@link spawn - spawned} in the first place */
			if (typeof supervisor !== "undefined") {
				this.supervisor = await Supervisor.build(
					this.name,
					this.descriptor,
					this.pragmas,
					this.attached,
					this.workerCount,
					this.introspection,
				);
			}

			logger.info(`reopened <${peekDescriptor(this.descriptor)}>`, {
				descriptor: peekDescriptor(this.descriptor),
			});
		})();
		this.reopening = reopening;

		try {
			await reopening;
		} finally {
			this.reopening = undefined;
		}
	}

	async despawn(): Promise<void> {
		// wait for reopening to complete to ensure current supervisor is despawned, not previous one
		await this.reopening;

		if (typeof this.supervisor === "undefined") {
			return;
		}

		await this.supervisor.despawn();
		this.supervisor = undefined;
	}

	private exec(
		sql: string,
		namedParameters?: Record<string, Parameter>,
		...anonymousParameters: Parameter[]
	) {
		if (typeof namedParameters === "undefined") {
			this.db.exec(sql);
		} else {
			const prepared = this.db.prepare(sql);
			prepared.setReturnArrays(true);
			prepared.all(namedParameters, ...anonymousParameters);
		}
	}

	private query(
		sql: string,
		behaviour: { returnArray: true } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: Parameter[]
	): Iterable<unknown>;
	private query(
		sql: string,
		behaviour: { returnArray: false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: Parameter[]
	): Iterable<Record<string, unknown>>;
	private *query(
		sql: string,
		behaviour: { returnArray: true | false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: Parameter[]
	): Iterable<Record<string, unknown>> | Iterable<unknown> {
		const statement = this.db.prepare(sql);
		if (behaviour.returnBigInt) {
			statement.setReadBigInts(true);
		}
		if (behaviour.returnArray) {
			// biome-ignore lint/suspicious/noExplicitAny: not typed yet
			(statement as any).setReturnArrays(true);
		}

		for (const row of statement.iterate(
			namedParameters,
			...anonymousParameters,
		)) {
			yield row;
		}
	}

	private location(dbName?: string): Maybe<string> {
		return this.db.location(dbName);
	}

	raw = {
		exec: this.exec.bind(this),
		query: this.query.bind(this),
		location: this.location.bind(this),
		close: () => this.db.close(),
	};

	get domains(): ReadonlyMap<string, DatabaseDomain> {
		return this.reached;
	}

	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<DB, "one", CM, R>,
		priority?: SupervisorWorkerPriority,
	): Promise<R | null>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<DB, "many", CM, R>,
		priority?: SupervisorWorkerPriority,
	): AsyncIterable<R>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<DB, "none", CM, R>,
		priority?: SupervisorWorkerPriority,
	): Promise<void>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<DB, ResultMode, CM, R>,
		priority?: SupervisorWorkerPriority,
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		const reopening = this.reopening;
		if (typeof reopening === "undefined") {
			if (typeof this.supervisor === "undefined") {
				throw new DatabaseSupervisorUnavailableError();
			}

			return this.supervisor.run(bound, priority);
		}

		// can't await here as `run` is synchronous
		// instead, wrap `AsyncIterable` returned by supervisor with async generator that does the await
		if (bound.resultMode === "many") {
			const self = this;
			return (async function* () {
				await reopening;

				if (typeof self.supervisor === "undefined") {
					throw new DatabaseSupervisorUnavailableError();
				}

				yield* self.supervisor.run(bound, priority) as AsyncIterable<R>;
			})();
		}

		return (async () => {
			await reopening;

			if (typeof this.supervisor === "undefined") {
				throw new DatabaseSupervisorUnavailableError();
			}

			return await (this.supervisor.run(bound, priority) as Promise<R | null>);
		})();
	}

	async begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (
			t: DatabaseTransaction<DB, CM extends "w" ? "r" | "w" : CM>,
		) => Promise<R>,
		priority?: SupervisorWorkerPriority,
		name?: string,
	): Promise<R> {
		await this.reopening;

		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		return this.supervisor.begin(connectionMode, fn, priority, name);
	}

	explain(bound: BoundQuery<DB, ResultMode, ConnectionMode, unknown>): string {
		let buf = "";
		const query = bound.query.substring(bound.query.indexOf("\n") + 1);

		const prepared = this.db.prepare(`explain query plan ${query}`);

		// rows form a tree: `.id` identifies a node, `.parent` references its enclosing node (0 = root)
		const rows = prepared.all(...bound.parameters) as unknown as {
			id: number;
			parent: number;
			detail: string;
		}[];

		const render = (parent: number, prefix: string) => {
			const children = rows.filter((row) => row.parent === parent);
			for (const [index, child] of children.entries()) {
				const last = index === children.length - 1;

				buf += `${prefix}${last ? "`- " : "|- "}${child.detail}\n`;
				render(child.id, `${prefix}${last ? "  " : "| "}`);
			}
		};

		render(0, "");

		return buf;
	}

	async assertHealthy(): Promise<void> {
		const bound1: BoundQuery<typeof this.name, "one", "w", never> = {
			database: this.name,
			name: "GetHealth",
			query: "select 1",
			parameters: [],
			connectionMode: "w",
			resultMode: "one",
			rowMode: "tuple",
			integerMode: "number",
		};

		const bound2: BoundQuery<typeof this.name, "one", "r", never> = {
			database: this.name,
			name: "GetHealth",
			query: "select 1",
			parameters: [],
			connectionMode: "r",
			resultMode: "one",
			rowMode: "tuple",
			integerMode: "number",
		};

		await Promise.all([this.run(bound1), this.run(bound2)]);
	}

	get sizeEstimate(): number {
		return this.raw
			.query(
				`select
        (
          (select page_count from pragma_page_count()) -
          (select freelist_count from pragma_freelist_count())
        ) * (select page_size from pragma_page_size())`,
				{ returnArray: true },
				{},
			)
			[Symbol.iterator]()
			.next().value[0];
	}

	async snapshot(destination: string): Promise<void> {
		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		// "vacuum into" acts as a read transaction for the duration of the vacuum
		// writes are not prevented, but checkpoints can't occur
		// the "-wal" file will therefor grow throughout the vacuum operation
		// this generally results in worse read performance
		await this.supervisor.run(
			{
				name: "VacuumInto",
				database: this.name,
				query: "vacuum into ?1",
				parameters: [destination],
				resultMode: "none",
				integerMode: "number",
				connectionMode: "r",
				rowMode: "tuple",
			},
			// will likely take a while, don't block default priority
			"background",
		);
	}
}

/** connection against a not yet promoted generation */
class DatabaseSwappableGeneration<DB extends DatabaseName | undefined>
	extends Database<DB>
	implements IDatabase<DB>
{
	private closed = false;
	private promoted = false;

	constructor(
		name: DB,
		private readonly domain: DatabaseDomain,
		readonly generation: DatabaseDomainGeneration,
		attached: DB extends DatabaseName
			? Record<DatabaseAttached[DB][number], DatabaseAttachment>
			: Record<string, DatabaseAttachment>,
		workerCount?: Record<SupervisorWorkerPriority, number>,
		pragmas?: Record<string, string>,
	) {
		// metrics are registered per database name, re-registering them would collide with the live one
		super(
			name,
			peekGeneration(generation).descriptor,
			attached,
			workerCount,
			pragmas,
			new StubIntrospection(),
		);
	}

	/** idempotent */
	async close(): Promise<void> {
		if (this.closed) {
			return;
		}

		await this.despawn();

		this.raw.close();
		this.closed = true;
	}

	/** closes and removes the generation (no-op if it has been swapped in) */
	async discard(): Promise<void> {
		await this.close();

		if (this.promoted) {
			return;
		}

		await this.domain.discard(this.generation);
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.discard();
	}

	/** marks the generation as live, so that {@link discard} stops being destructive */
	promote(): void {
		this.promoted = true;
	}
}

/** database that lives in a {@link DatabaseDomain} and can therefor swapped to new generation atomically */
export class DatabaseSwappable<DB extends DatabaseName | undefined>
	extends Database<DB>
	implements IDatabaseSwappable<DB>
{
	constructor(
		name: DB,
		private readonly domain: DatabaseDomain,
		attached: DB extends DatabaseName
			? Record<DatabaseAttached[DB][number], DatabaseAttachment>
			: Record<string, DatabaseAttachment>,
		workerCount?: Record<SupervisorWorkerPriority, number>,
		introspection?: IIntrospection,
	) {
		// the descriptor reaches the database through `current`, which SQLite resolves on every open
		super(
			name,
			peekGeneration(domain.bootstrap()).descriptor,
			attached,
			workerCount,
			undefined,
			introspection,
		);

		// `main` is what SQLite calls the database a connection was opened against
		this.reached.set("main", domain);
	}

	/**
	 * a read-only domain is owned by another instance, which builds and promotes generations in it
	 * and discards whatever it replaces — joining in from here would hand out a generation that is
	 * about to be taken away
	 */
	private assertWritable(): void {
		if (this.domain.readOnly) {
			throw new DatabaseReadOnlyDomainError(this.domain.root);
		}
	}

	/**
	 * copies the current database into a new generation and opens it
	 *
	 * **current database must not be modified while this runs**
	 */
	async copy(
		pragmas?: Record<string, string>,
	): Promise<DatabaseSwappableGeneration<DB>> {
		this.assertWritable();

		const cloned = await this.domain.clone();
		const { id, target, path } = peekGeneration(cloned);

		const generation = new DatabaseSwappableGeneration(
			this.name,
			this.domain,
			cloned,
			this.attached as ConstructorParameters<typeof Database<DB>>[2],
			this.workerCount,
			pragmas,
		);

		logger.info(`copied <${this.name ?? "-"}> into <${target}>`, {
			database: this.name,
			generation: id,
			path,
			pragmas,
		});

		return generation;
	}

	/** promotes a generation to `current` and discards the generation it replaces */
	async swap(generation: DatabaseSwappableGeneration<DB>): Promise<void> {
		this.assertWritable();

		const { id, target } = peekGeneration(generation.generation);

		// the generation is about to be read by everyone, its own writes have to have landed first
		await generation.close();
		generation.promote();

		const replaced = this.domain.point(generation.generation);
		const previous =
			typeof replaced === "undefined"
				? undefined
				: peekGeneration(replaced).target;

		await this.respawn();

		if (typeof replaced !== "undefined" && previous !== target) {
			await this.domain.discard(replaced);
		}

		logger.info(`swapped <${this.name ?? "-"}> to <${target}>`, {
			database: this.name,
			generation: id,
			previous,
		});
	}
}
