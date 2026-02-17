import { COPYFILE_FICLONE_FORCE } from "node:constants";
import { copyFile, statfs } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { logger as parentLogger } from "../../logger";
import { isNone, type Maybe } from "../../type/maybe";
import { injectOrStub } from "../../utility/dependency-injection";
import { IIntrospection } from "../introspect";
import { StubIntrospection } from "../introspect/stub";
import { Supervisor } from "./supervisor";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

const logger = parentLogger.child({ label: "db" });

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
		location(): Maybe<string>;
		close(): void;
	};

	assertHealthy(): Promise<void>;

	/** not available for in-memory databases and only available on filesystems that support CoW reflinks */
	snapshot(destination: string): Promise<void>;
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

export class DatabaseInMemorySnapshotError extends Error {
	constructor() {
		super("snapshot is not available for in-memory databases");
		Object.setPrototypeOf(this, DatabaseInMemorySnapshotError.prototype);
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

export const IDatabase = createType<IDatabase>("IDatabase");

export class Database implements IDatabase {
	private db: DatabaseSync;
	private pragmas: Record<string, string>;

	private supervisor: Supervisor | undefined;

	constructor(
		/** conversion to `URL` is attempted automatically as e.g. vfs selection only works when provided as `URL`
		 *
		 * if conversion fails, the provided value is used as-is
		 *
		 * examples:
		 * * `file:///home/user/foo.db?vfs=unix-excl` → opens "foo.db" with vfs "unix-excl"
		 * * `/home/user/foo.db?vfs=unix-excl` → opens "foo.db?vfs=unix-excl" (likely undesirable)
		 * * `file://./foo.db?vfs=unix-excl` → will fail file resolution as relative file `URL`s can't be constructed
		 */
		path: string = inject(ConfigProvider)((c) => c.database.path),
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
		const bound1: BoundQuery<"one", "w", never> = {
			name: "GetHealth",
			query: "select 1",
			parameters: [],
			connectionMode: "w",
			resultMode: "one",
			rowMode: "tuple",
			integerMode: "number",
		};

		const bound2: BoundQuery<"one", "r", never> = {
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

	async snapshot(destination: string): Promise<void> {
		const location = this.db.location();
		if (isNone(location)) {
			throw new DatabaseInMemorySnapshotError();
		}

		// https://www.sqlite.org/pragma.html#pragma_wal_autocheckpoint
		// checkpoint as many frames as possible
		// only FULL / RESTART / TRUNCATE return a status, therefor no need to check
		this.db.exec("pragma wal_checkpoint(passive)");

		// reflink
		await copyFile(location, destination, COPYFILE_FICLONE_FORCE);
	}
}
