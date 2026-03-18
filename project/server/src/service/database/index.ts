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
	attachmentPath,
	type DatabaseAttached,
	type DatabaseAttachmentDescriptor,
	type DatabaseName,
} from "./base";
import { Supervisor, type SupervisorWorkerPriority } from "./supervisor";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

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

	spawn(workerCount: Record<SupervisorWorkerPriority, number>): Promise<void>;
	despawn(): Promise<void>;

	begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (
			t: DatabaseTransaction<DB, CM extends "w" ? "r" | "w" : CM>,
		) => Promise<R>,
		priority?: SupervisorWorkerPriority,
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

	raw: {
		exec(sql: string): void;
		query(
			sql: string,
			behaviour: { returnArray: false } & RunBehaviour,
			namedParameters: Record<string, Parameter>,
			...anonymousParameters: string[]
		): Iterable<Record<string, unknown>>;
		query(
			sql: string,
			behaviour: { returnArray: true } & RunBehaviour,
			namedParameters: Record<string, Parameter>,
			...anonymousParameters: string[]
		): Iterable<unknown>;
		location(): Maybe<string>;
		close(): void;
	};

	assertHealthy(): Promise<void>;

	get sizeEstimate(): number;

	/** should not be called directly
	 * use an appropriate `IDatabaseSnapshotCoordinator` instead
	 */
	snapshot(destination: string): Promise<void>;
};

export class DatabaseMoreThanOneError extends Error {
	constructor(
		public query: BoundQuery<
			string | undefined,
			"one",
			ConnectionMode,
			unknown
		>,
	) {
		super(`<${query.name}> query with "one" aritry returned more than row`);
		Object.setPrototypeOf(this, DatabaseMoreThanOneError.prototype);
	}
}

export class DatabaseInMemorySpawnError extends Error {
	constructor() {
		super("spawn is not available for in-memory databases");
		Object.setPrototypeOf(this, DatabaseInMemorySpawnError.prototype);
	}
}

export class DatabaseInMemoryLockedError extends Error {
	constructor() {
		super("locked is not available for in-memory databases");
		Object.setPrototypeOf(this, DatabaseInMemoryLockedError.prototype);
	}
}

export class DatabaseSupervisorUnavailableError extends Error {
	constructor() {
		super("supervisor unavailable, was it spawned?");
		Object.setPrototypeOf(this, DatabaseSupervisorUnavailableError.prototype);
	}
}

const pragmas = {
	foreign_keys: "on",
	journal_mode: "wal",
	synchronous: "normal",
} as const;

export const IDatabaseDerived =
	createType<IDatabase<"derived">>("IDatabaseDerived");
export const IDatabaseStaging =
	createType<IDatabase<"staging">>("IDatabaseStaging");

export class Database<DB extends DatabaseName | undefined>
	implements IDatabase<DB>
{
	private db: DatabaseSync;
	private pragmas: Record<string, string>;
	private attached: Record<string, DatabaseAttachmentDescriptor>;

	private supervisor: Supervisor | undefined;

	constructor(
		public readonly name: DB,
		/** conversion to `URL` is attempted automatically as e.g. vfs selection only works when provided as `URL`
		 *
		 * if conversion fails, the provided value is used as-is
		 *
		 * examples:
		 * * `file:///home/user/foo.db?vfs=unix-excl` → opens "foo.db" with vfs "unix-excl"
		 * * `/home/user/foo.db?vfs=unix-excl` → opens "foo.db?vfs=unix-excl" (likely undesirable)
		 * * `file://./foo.db?vfs=unix-excl` → will fail file resolution as relative file `URL`s can't be constructed
		 */
		path: string,
		attached: DB extends DatabaseName
			? Record<DatabaseAttached[DB][number], DatabaseAttachmentDescriptor>
			: Record<string, DatabaseAttachmentDescriptor>,
		readOnly: boolean = false,
		private introspection: IIntrospection = injectOrStub(
			IIntrospection,
			() => new StubIntrospection(),
		),
	) {
		let url;
		try {
			url = new URL(path);
		} catch {}

		this.db = new DatabaseSync(url ?? path, {
			timeout: 5000,
			readOnly,
		});

		if (typeof url !== "undefined") {
			logger.info(`opened converted path <${url.pathname}>`, {
				path: url.pathname,
				parameters: Object.fromEntries([...url.searchParams.entries()]),
			});
		}

		this.pragmas = pragmas;
		for (const [key, value] of Object.entries(this.pragmas)) {
			this.db.exec(`pragma ${key} = ${value}`);
		}

		this.attached = attached;
		for (const [name, descriptor] of Object.entries(attached)) {
			this.db.exec(`attach '${attachmentPath(descriptor)}' as ${name}`);
		}

		introspection.metric.gauge(
			{
				name: `database_${name}_wal_size_total`,
				help: "size of database wal file",
				labelNames: [],
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

	async spawn(
		workerCount: Record<SupervisorWorkerPriority, number>,
	): Promise<void> {
		const location = this.db.location();
		if (isNone(location)) {
			throw new DatabaseInMemorySpawnError();
		}

		if (typeof this.supervisor !== "undefined") {
			return;
		}

		this.supervisor = await Supervisor.build(
			this.name,
			location,
			this.pragmas,
			this.attached,
			workerCount,
			this.introspection,
		);
	}

	async despawn(): Promise<void> {
		if (typeof this.supervisor === "undefined") {
			return;
		}

		await this.supervisor.despawn();
		this.supervisor = undefined;
	}

	private exec(sql: string) {
		this.db.exec(sql);
	}

	private query(
		sql: string,
		behaviour: { returnArray: true } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): Iterable<unknown>;
	private query(
		sql: string,
		behaviour: { returnArray: false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): Iterable<Record<string, unknown>>;
	private *query(
		sql: string,
		behaviour: { returnArray: true | false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
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

	private location(): Maybe<string> {
		return this.db.location();
	}

	raw = {
		exec: this.exec.bind(this),
		query: this.query.bind(this),
		location: this.location.bind(this),
		close: () => this.db.close(),
	};

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
		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		return this.supervisor.run(bound, priority);
	}

	async begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (
			t: DatabaseTransaction<DB, CM extends "w" ? "r" | "w" : CM>,
		) => Promise<R>,
		priority?: SupervisorWorkerPriority,
	): Promise<R> {
		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		return this.supervisor.begin(connectionMode, fn, priority);
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
