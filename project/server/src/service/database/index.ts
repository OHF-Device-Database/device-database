import { createReadStream } from "node:fs";
import { statfs } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Readable } from "node:stream";

import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { isNone, type Maybe } from "../../type/maybe";
import { injectOrStub } from "../../utility/dependency-injection";
import { IIntrospection } from "../introspect";
import { StubIntrospection } from "../introspect/stub";
import { Supervisor } from "./supervisor";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

type Parameter = SQLInputValue;

type RunBehaviour = { returnBigInt?: boolean };

export type DatabaseTransaction<CM extends ConnectionMode> = {
	run<R>(bound: BoundQuery<"one", CM, R>): Promise<R | null>;
	run<R>(bound: BoundQuery<"many", CM, R>): AsyncIterable<R>;
	run<R>(bound: BoundQuery<"none", CM, R>): Promise<void>;
};

export type IDatabase = {
	spawn(workerCount?: number): Promise<void>;
	despawn(): Promise<void>;

	begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (t: DatabaseTransaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>,
	): Promise<R>;

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
		close(): void;
	};

	assertHealthy(): Promise<void>;

	/** streaming snapshot, not available for in-memory databases */
	snapshot(signal?: AbortSignal): Maybe<Readable>;
} & DatabaseTransaction<ConnectionMode>;

export class DatabaseMoreThanOneError extends Error {
	constructor(public query: BoundQuery<"one", ConnectionMode, unknown>) {
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

export class DatabaseSupervisorUnavailableError extends Error {
	constructor() {
		super("supervisor unavailable, was it spawned?");
		Object.setPrototypeOf(this, DatabaseSupervisorUnavailableError.prototype);
	}
}

const pragmas = {
	foreign_keys: "on",
	// https://litestream.io/tips/#wal-journal-mode
	journal_mode: "wal",
	// https://litestream.io/tips/#synchronous-pragma
	synchronous: "normal",
} as const;

export const IDatabase = createType<IDatabase>("IDatabase");

export class Database implements IDatabase {
	private db: DatabaseSync;
	private pragmas: Record<string, string>;

	private supervisor: Supervisor | undefined;

	constructor(
		path: string = inject(ConfigProvider)((c) => c.database.path),
		readOnly: boolean = false,
		private externalCheckpoint: boolean = inject(ConfigProvider)(
			(c) => c.database.externalCheckpoint,
		),
		introspection: IIntrospection = injectOrStub(
			IIntrospection,
			() => new StubIntrospection(),
		),
	) {
		this.db = new DatabaseSync(path, {
			// https://litestream.io/tips/#busy-timeout
			timeout: 5000,
			readOnly,
		});

		this.pragmas = {
			...pragmas,
			// https://litestream.io/tips/#disable-autocheckpoints-for-high-write-load-servers
			...(externalCheckpoint
				? {
						wal_autocheckpoint: "0",
					}
				: {}),
		};

		for (const [key, value] of Object.entries(this.pragmas)) {
			this.db.exec(`pragma ${key} = ${value}`);
		}

		introspection.metric.gauge(
			{
				name: "database_size_total",
				help: "size of database",
				labelNames: ["entity"],
			},
			async (collector) => {
				const bound: BoundQuery<"many", "r", [string, number]> = {
					name: "GetEntitySize",
					query: "select name, pgsize from dbstat where aggregate = true;",
					parameters: [],
					connectionMode: "r",
					resultMode: "many",
					rowMode: "tuple",
					integerMode: "number",
				};

				for await (const row of this.run(bound)) {
					collector.set({ entity: row[0] }, row[1]);
				}
			},
		);

		introspection.metric.gauge(
			{
				name: "database_filesystem_available_total",
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
				name: "database_filesystem_capacity_total",
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

	async spawn(workerCount = availableParallelism()): Promise<void> {
		const location = this.db.location();
		if (isNone(location)) {
			throw new DatabaseInMemorySpawnError();
		}

		if (typeof this.supervisor !== "undefined") {
			return;
		}

		this.supervisor = await Supervisor.build(
			location,
			this.pragmas,
			workerCount,
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

	raw = {
		exec: this.exec.bind(this),
		query: this.query.bind(this),
		close: () => this.db.close(),
	};

	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"one", CM, R>,
	): Promise<R | null>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"many", CM, R>,
	): AsyncIterable<R>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"none", CM, R>,
	): Promise<void>;
	public run<CM extends ConnectionMode, R>(
		bound: BoundQuery<ResultMode, CM, R>,
	): Promise<R | null> | AsyncIterable<R> | Promise<void> {
		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		return this.supervisor.run(bound);
	}

	async begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (t: DatabaseTransaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>,
	): Promise<R> {
		if (typeof this.supervisor === "undefined") {
			throw new DatabaseSupervisorUnavailableError();
		}

		return this.supervisor.begin(connectionMode, fn);
	}

	async assertHealthy(): Promise<void> {
		const bound: BoundQuery<"one", "w", never> = {
			name: "GetHealth",
			query: "select 1",
			parameters: [],
			connectionMode: "w",
			resultMode: "one",
			rowMode: "tuple",
			integerMode: "number",
		};

		await this.run(bound);
	}

	snapshot(signal?: AbortSignal): Maybe<Readable> {
		const location = this.db.location();
		if (isNone(location)) {
			return null;
		}

		// acquire shared lock
		// https://www.sqlite.org/lockingv3.html#transaction_control
		// https://www.sqlite.org/backup.html#using_the_sqlite_online_backup_api
		const db = new DatabaseSync(location);

		// perform checkpoint when no external process that manages checkpoints is running
		/* node:coverage disable */
		if (!this.externalCheckpoint) {
			db.exec("pragma wal_checkpoint(passive)");
		}
		/* node:coverage enable */

		db.exec("begin transaction; select 1;");

		const stream = createReadStream(location, {
			highWaterMark: 16 * 1024,
			signal,
		});
		stream.once("close", () => {
			db.close();
		});

		return stream;
	}
}
