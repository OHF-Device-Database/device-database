import { createReadStream } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Readable } from "node:stream";

import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { isNone, type Maybe } from "../../type/maybe";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

type Parameter = SQLInputValue;

type RunBehaviour = { returnBigInt?: boolean };

type Transaction<CM extends ConnectionMode> = {
	run<R>(bound: BoundQuery<"one", CM, R>): Promise<R | null>;
	run<R>(bound: BoundQuery<"many", CM, R>): AsyncIterable<R>;
	run<R>(bound: BoundQuery<"none", CM, R>): Promise<void>;
};

export type IDatabase = {
	begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (t: Transaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>,
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

	/** streaming snapshot, not available for in-memory databases */
	snapshot(signal?: AbortSignal): Maybe<Readable>;
} & Transaction<ConnectionMode>;

export class DatabaseMoreThanOneError extends Error {
	constructor(public query: BoundQuery<"one", ConnectionMode, unknown>) {
		super(`<${query.name}> query with "one" aritry returned more than row`);
		Object.setPrototypeOf(this, DatabaseMoreThanOneError.prototype);
	}
}

export class DatabaseAttemptedInMemoryTransactionError extends Error {
	constructor() {
		super("transactions are not supported for in-memory databases");
		Object.setPrototypeOf(
			this,
			DatabaseAttemptedInMemoryTransactionError.prototype,
		);
	}
}

export const IDatabase = createType<IDatabase>("IDatabase");

export class Database implements IDatabase {
	private db: DatabaseSync;
	private writeLock: Promise<void>;

	constructor(
		path: string = inject(ConfigProvider)((c) => c.database.path),
		readOnly: boolean = false,
		private externalCheckpoint: boolean = inject(ConfigProvider)(
			(c) => c.database.externalCheckpoint,
		),
	) {
		this.db = new DatabaseSync(path, {
			// https://litestream.io/tips/#busy-timeout
			timeout: 5000,
			readOnly,
		});

		this.db.exec("pragma foreign_keys = on");
		// https://litestream.io/tips/#wal-journal-mode
		this.db.exec("pragma journal_mode = wal");
		// https://litestream.io/tips/#synchronous-pragma
		this.db.exec("pragma synchronous = normal");

		/* node:coverage disable */
		if (externalCheckpoint) {
			// https://litestream.io/tips/#disable-autocheckpoints-for-high-write-load-servers
			this.db.exec("pragma wal_autocheckpoint = 0");
		}
		/* node:coverage enable */

		const { promise, resolve } = Promise.withResolvers<void>();
		resolve();
		this.writeLock = promise;
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
		const statement = this.db.prepare(bound.query);
		statement.setReadBigInts(bound.integerMode === "bigint");
		// biome-ignore lint/suspicious/noExplicitAny: not typed yet
		(statement as any).setReturnArrays(bound.rowMode === "tuple");

		switch (bound.resultMode) {
			case "one": {
				return (async () => {
					const iterator = statement.iterate(...bound.parameters);
					const row = iterator.next();
					if (row.done) {
						return null;
					} else {
						// iterator has to be completely exhaused when inserting, otherwise the transaction never completes
						const { done } = iterator.next();
						if (!done) {
							throw new DatabaseMoreThanOneError(
								bound as BoundQuery<"one", CM, R>,
							);
						}
					}

					return row.value;
				})() as Promise<R | null>;
			}
			case "many": {
				return (async function* f() {
					const iterator = statement.iterate(...bound.parameters);
					for (const row of iterator) {
						yield row;
					}
				})() as AsyncIterable<R>;
			}
			case "none": {
				return (async () => {
					statement.run(...bound.parameters);
				})() as Promise<void>;
			}
		}
	}

	async begin<const CM extends ConnectionMode, R>(
		connectionMode: CM,
		fn: (t: Transaction<CM extends "w" ? "r" | "w" : CM>) => Promise<R>,
	): Promise<R> {
		const location = this.db.location();
		if (isNone(location)) {
			throw new DatabaseAttemptedInMemoryTransactionError();
		}

		// TODO: worker threads
		// currently there is no actual concurrency going on, as all database
		// operations happen synchronously

		let db;
		let finalize: (() => void) | undefined;
		switch (connectionMode) {
			case "r": {
				const connection = new DatabaseSync(location, {
					readOnly: true,
				});

				db = connection;
				finalize = () => {
					connection.close();
				};
				break;
			}
			case "w": {
				await this.writeLock;
				const { promise, resolve } = Promise.withResolvers<void>();
				this.writeLock = promise;

				db = this.db;
				finalize = resolve;
				break;
			}
		}

		db.exec("begin transaction;");

		let result;
		try {
			result = await fn({ run: this.run.bind({ db }) });
			db.exec("commit;");
		} catch (e) {
			db.exec("rollback;");
			throw e;
		} finally {
			finalize?.();
		}

		return result;
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
