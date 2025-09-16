import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { createType } from "@lppedd/di-wise-neo";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

type Parameter = SQLInputValue;

type RunBehaviour = { returnBigInt?: boolean };

export type IDatabase = {
	exec(sql: string): Promise<void>;
	query(
		sql: string,
		behaviour: { returnArray: false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): AsyncIterable<Record<string, unknown>>;
	query(
		sql: string,
		behaviour: { returnArray: true } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): AsyncIterable<unknown>;

	run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"one", CM, R>,
	): Promise<R | null>;
	run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"many", CM, R>,
	): AsyncIterable<R>;
	run<CM extends ConnectionMode, R>(
		bound: BoundQuery<"none", CM, R>,
	): Promise<void>;
};

export class DatabaseMoreThanOneError extends Error {
	constructor(public query: BoundQuery<"one", ConnectionMode, unknown>) {
		super(`<${query.name}> query with "one" aritry returned more than row`);
		Object.setPrototypeOf(this, DatabaseMoreThanOneError.prototype);
	}
}

export const IDatabase = createType<IDatabase>("IDatabase");

export class Database implements IDatabase {
	private db: DatabaseSync;

	constructor(path: string, readOnly: boolean) {
		this.db = new DatabaseSync(path, {
			// https://litestream.io/tips/#busy-timeout
			timeout: 5000,
			readOnly,
		});
	}

	public async exec(sql: string): Promise<void> {
		this.db.exec(sql);
	}

	public query(
		sql: string,
		behaviour: { returnArray: true } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): AsyncIterable<unknown>;
	public query(
		sql: string,
		behaviour: { returnArray: false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): AsyncIterable<Record<string, unknown>>;
	public async *query(
		sql: string,
		behaviour: { returnArray: true | false } & RunBehaviour,
		namedParameters: Record<string, Parameter>,
		...anonymousParameters: string[]
	): AsyncIterable<Record<string, unknown>> | AsyncIterable<unknown> {
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
}
