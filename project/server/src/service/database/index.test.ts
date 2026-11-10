import { randomUUID } from "node:crypto";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { type TestContext, test } from "node:test";

import { isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import {
	Database,
	DatabaseInMemoryReopenError,
	DatabaseMoreThanOneError,
	DatabaseSupervisorUnavailableError,
} from ".";
import { bake } from "./base";
import { Supervisor } from "./supervisor";
import { testDatabase } from "./utility";

import type { BoundQuery, Query } from "./query";

test("bound one", async (t: TestContext) => {
	type GetOneParametersNamed = {
		one: any;
	};
	type GetOneParametersAnonymous = [one: any];
	type GetOneRecordRowModeObjectIntegerModeNumber = {
		one: unknown;
	};
	type GetOneRecordRowModeObjectIntegerModeBigInt = {
		one: unknown;
	};
	type GetOneRecordRowModeTupleIntegerModeNumber = {
		one: unknown;
	};
	type GetOneRecordRowModeTupleIntegerModeBigInt = {
		one: unknown;
	};

	const getOne: Query<
		undefined,
		"one",
		"r",
		GetOneParametersNamed,
		GetOneParametersAnonymous,
		GetOneRecordRowModeObjectIntegerModeNumber,
		GetOneRecordRowModeObjectIntegerModeBigInt,
		GetOneRecordRowModeTupleIntegerModeNumber,
		GetOneRecordRowModeTupleIntegerModeBigInt
	> = {
		database: undefined,
		name: "GetOne",
		query: `-- name: GetOne :one
  select cast(?1 as number) as one where ?1 != 2`,
		bind: {
			named: (
				parameters: GetOneParametersNamed,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getOne.database,
					name: getOne.name,
					query: getOne.query,
					parameters: [parameters.one],
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "one",
					connectionMode: "r",
				};
			},
			anonymous: (
				parameters: GetOneParametersAnonymous,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getOne.database,
					name: getOne.name,
					query: getOne.query,
					parameters,
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "one",
					connectionMode: "r",
				};
			},
		},
	} as const;

	await using database = await testDatabase(undefined, false);

	{
		const result = await database.run(getOne.bind.anonymous([1]));
		// node:sqlite returns `[Object: null prototype]` objects
		t.assert.partialDeepStrictEqual(result, { one: 1 });
	}

	{
		const result = await database.run(getOne.bind.anonymous([2]));
		t.assert.strictEqual(result, null);
	}
});

test("bound one too many", async (t: TestContext) => {
	type GetOneParametersNamed = Record<string, never>;
	type GetOneParametersAnonymous = [];
	type GetOneRecordRowModeObjectIntegerModeNumber = {
		one: unknown;
	};
	type GetOneRecordRowModeObjectIntegerModeBigInt = {
		one: unknown;
	};
	type GetOneRecordRowModeTupleIntegerModeNumber = {
		one: unknown;
	};
	type GetOneRecordRowModeTupleIntegerModeBigInt = {
		one: unknown;
	};

	const getOne: Query<
		undefined,
		"one",
		"r",
		GetOneParametersNamed,
		GetOneParametersAnonymous,
		GetOneRecordRowModeObjectIntegerModeNumber,
		GetOneRecordRowModeObjectIntegerModeBigInt,
		GetOneRecordRowModeTupleIntegerModeNumber,
		GetOneRecordRowModeTupleIntegerModeBigInt
	> = {
		database: undefined,
		name: "GetOne",
		query: `-- name: GetOne :one
  select 1 as one union all select 2 as one`,
		bind: {
			named: (
				parameters: GetOneParametersNamed,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getOne.database,
					name: getOne.name,
					query: getOne.query,
					parameters: [parameters.one],
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "one",
					connectionMode: "r",
				};
			},
			anonymous: (
				parameters: GetOneParametersAnonymous,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"one",
						"r",
						GetOneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getOne.database,
					name: getOne.name,
					query: getOne.query,
					parameters,
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "one",
					connectionMode: "r",
				};
			},
		},
	} as const;

	await using database = await testDatabase(undefined, false);

	const bound = getOne.bind.anonymous([]);
	await t.assert.rejects(
		database.run(bound),
		new DatabaseMoreThanOneError(bound),
	);
});

test("bound many", async (t: TestContext) => {
	type GetManyParametersNamed = {
		one: any;
		two: any;
	};
	type GetManyParametersAnonymous = [one: any, two: any];
	type GetManyRecordRowModeObjectIntegerModeNumber = {
		one: unknown;
	};
	type GetManyRecordRowModeObjectIntegerModeBigInt = {
		one: unknown;
	};
	type GetManyRecordRowModeTupleIntegerModeNumber = {
		one: unknown;
	};
	type GetManyRecordRowModeTupleIntegerModeBigInt = {
		one: unknown;
	};

	const getMany: Query<
		undefined,
		"many",
		"r",
		GetManyParametersNamed,
		GetManyParametersAnonymous,
		GetManyRecordRowModeObjectIntegerModeNumber,
		GetManyRecordRowModeObjectIntegerModeBigInt,
		GetManyRecordRowModeTupleIntegerModeNumber,
		GetManyRecordRowModeTupleIntegerModeBigInt
	> = {
		database: undefined,
		name: "GetMany",
		query: `-- name: GetMany :many
  select cast(?1 as number) as one
  union all
  select cast(?2 as number) as one`,
		bind: {
			named: (
				parameters: GetManyParametersNamed,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getMany.database,
					name: getMany.name,
					query: getMany.query,
					parameters: [parameters.one, parameters.two],
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "many",
					connectionMode: "r",
				};
			},
			anonymous: (
				parameters: GetManyParametersAnonymous,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getMany.database,
					name: getMany.name,
					query: getMany.query,
					parameters,
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "many",
					connectionMode: "r",
				};
			},
		},
	} as const;

	await using database = await testDatabase(undefined, false);

	{
		const result = await unroll(database.run(getMany.bind.anonymous([1, 2])));
		// node:sqlite returns `[Object: null prototype]` objects
		t.assert.partialDeepStrictEqual(result, [{ one: 1 }, { one: 2 }]);
	}
});

test("bound none", async (t: TestContext) => {
	type GetNoneParametersNamed = Record<string, never>;
	type GetNoneParametersAnonymous = [];
	type GetNoneRecordRowModeObjectIntegerModeNumber = never;
	type GetNoneRecordRowModeObjectIntegerModeBigInt = never;
	type GetNoneRecordRowModeTupleIntegerModeNumber = never;
	type GetNoneRecordRowModeTupleIntegerModeBigInt = never;

	const getNone: Query<
		undefined,
		"none",
		"r",
		GetNoneParametersNamed,
		GetNoneParametersAnonymous,
		GetNoneRecordRowModeObjectIntegerModeNumber,
		GetNoneRecordRowModeObjectIntegerModeBigInt,
		GetNoneRecordRowModeTupleIntegerModeNumber,
		GetNoneRecordRowModeTupleIntegerModeBigInt
	> = {
		database: undefined,
		name: "GetNone",
		query: `-- name: GetNone :exec
select null`,
		bind: {
			named: (
				parameters: GetNoneParametersNamed,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getNone.database,
					name: getNone.name,
					query: getNone.query,
					parameters: [],
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "none",
					connectionMode: "r",
				};
			},
			anonymous: (
				parameters: GetNoneParametersAnonymous,
				configuration?: {
					rowMode?: "object" | "tuple";
					integerMode?: "number" | "bigint";
				},
			):
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeObjectIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeObjectIntegerModeBigInt
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeNumber
				  >
				| BoundQuery<
						undefined,
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
					database: getNone.database,
					name: getNone.name,
					query: getNone.query,
					parameters,
					rowMode: configuration?.rowMode ?? "object",
					integerMode: configuration?.integerMode ?? "number",
					resultMode: "none",
					connectionMode: "r",
				};
			},
		},
	} as const;

	await using database = await testDatabase(undefined, false);

	{
		const result = await database.run(getNone.bind.anonymous([]));
		t.assert.strictEqual(result, undefined);
	}
});

test("snapshot", async (t: TestContext) => {
	t.test("persistent database", async (t: TestContext) => {
		const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

		const expected = randomUUID();
		const unexpected = randomUUID();

		await using db1 = await testDatabase(undefined, false);

		const location = db1.raw.location();
		t.assert.ok(isSome(location));

		const db2 = new Database(undefined, bake({ location }), {});

		// disable automatic checkpointing, to simulate an outstanding checkpoint
		db1.raw.exec("pragma wal_autocheckpoint=0");
		db1.raw.exec("create table foo (bar text)");
		[
			...db1.raw.query(
				"insert into foo (bar) values (:bar)",
				{ returnArray: false },
				{ bar: expected },
			),
		];

		// create intentionally uncommitted transaction which should neither be observable,
		// nor block snapshotting
		db2.raw.exec("begin immediate;");
		db2.raw.query(
			"insert into foo (bar) values (:bar)",
			{ returnArray: false },
			{ bar: unexpected },
		);

		{
			const dir = await mkdtemp(join(baseDirectory, "snapshot-destination"));
			const location = join(dir, "snapshot.db");

			try {
				await db1.snapshot(location);

				const db3 = new Database(undefined, bake({ location }), {});

				const result = [
					...db3.raw.query("select bar from foo", { returnArray: true }, {}),
				];
				t.assert.deepStrictEqual(result, [[expected]]);

				db3.raw.close();
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});
});

test("attachments", async (t: TestContext) => {
	t.test("raw", async (t: TestContext) => {
		await using db1 = await testDatabase(undefined, false);
		const locationDb1 = db1.raw.location();
		t.assert.ok(isSome(locationDb1));

		db1.raw.exec(
			"create table foo (bar text primary key not null) strict, without rowid",
		);
		db1.raw.exec("insert into foo values ('baz')");

		await using db2 = await testDatabase(undefined, false, {
			db1: bake({ location: locationDb1, readOnly: true }),
		});

		t.assert.partialDeepStrictEqual(
			[...db2.raw.query("select bar from foo", { returnArray: true }, {})],
			[["baz"]],
		);
	});

	t.test("supervisor", async (t: TestContext) => {
		await using db1 = await testDatabase(undefined, false);
		const locationDb1 = db1.raw.location();
		t.assert.ok(isSome(locationDb1));

		db1.raw.exec(
			"create table foo (bar text primary key not null) strict, without rowid",
		);
		db1.raw.exec("insert into foo values ('baz')");

		await using db2 = await testDatabase(undefined, false, {
			db1: bake({ location: locationDb1, readOnly: true }),
		});

		t.assert.partialDeepStrictEqual(
			await unroll(
				db2.run({
					name: "GetFoo",
					query: "select bar from foo",
					connectionMode: "r",
					database: undefined,
					resultMode: "many",
					parameters: [],
					rowMode: "tuple",
					integerMode: "number",
				}),
			),
			[["baz"]],
		);
	});
});

test("size estimate", (t: TestContext) => {
	const db = new Database(
		undefined,
		bake({ location: new URL("file:?mode=memory") }),
		{},
	);
	db.raw.exec(
		"create table foo (bar integer primary key not null) strict, without rowid",
	);

	// "generate_series" isn't enabled in node
	for (let i = 0; i < 100; i++) {
		db.raw
			.query("insert into foo values (:i)", { returnArray: true }, { i })
			[Symbol.iterator]()
			.next();
	}

	t.assert.deepStrictEqual(db.sizeEstimate, 8192);
});

test("respawn", async (t: TestContext) => {
	const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

	const getBar: BoundQuery<undefined, "one", "r", unknown> = {
		database: undefined,
		name: "GetBar",
		query: "select bar from foo",
		parameters: [],
		connectionMode: "r",
		resultMode: "one",
		rowMode: "tuple",
		integerMode: "number",
	};

	const getBars: BoundQuery<undefined, "many", "r", unknown> = {
		...getBar,
		name: "GetBars",
		resultMode: "many",
	};

	/** reads through the direct connection rather than through a worker */
	const direct = (database: Database<undefined>) => [
		...database.raw.query("select bar from foo", { returnArray: true }, {}),
	];

	/** writes a self-contained database file, as an external process would */
	const persist = (location: string, value: string) => {
		const database = new Database(undefined, bake({ location }), {});
		database.raw.exec("create table foo (bar text not null) strict");
		database.raw.exec(`insert into foo values ('${value}')`);
		// closing checkpoints the wal back into the main file, leaving no sidecars
		database.raw.close();
	};

	/** unlinks the database and puts a freshly persisted one in its place */
	const replace = async (location: string, value: string) => {
		const staged = `${location}.staged`;
		persist(staged, value);

		// the sidecars describe the inode that is going away, they must not outlive it
		await rm(`${location}-wal`, { force: true });
		await rm(`${location}-shm`, { force: true });
		await rm(location, { force: true });

		await rename(staged, location);
	};

	const fixture = async (value: string, spawn: boolean) => {
		const directory = await mkdtemp(
			join(baseDirectory, "device-database-testing-"),
		);
		const location = join(directory, "testing.db");

		persist(location, value);

		const database = new Database(undefined, bake({ location }), {});
		if (spawn) {
			await database.spawn({ default: 1, background: 1 });
		}

		return {
			database,
			location,
			[Symbol.asyncDispose]: async () => {
				await database.despawn();
				database.raw.close();
				await rm(directory, { recursive: true, force: true });
			},
		};
	};

	await t.test("observes a replaced file", async (t: TestContext) => {
		await using f = await fixture("old", true);

		t.assert.deepStrictEqual(await f.database.run(getBar), ["old"]);
		t.assert.deepStrictEqual(direct(f.database), [["old"]]);

		await replace(f.location, "new");

		// every open connection still holds the inode that was unlinked
		t.assert.deepStrictEqual(await f.database.run(getBar), ["old"]);
		t.assert.deepStrictEqual(direct(f.database), [["old"]]);

		await f.database.respawn();

		t.assert.deepStrictEqual(await f.database.run(getBar), ["new"]);
		t.assert.deepStrictEqual(direct(f.database), [["new"]]);
	});

	await t.test(
		"parks work submitted while respawning",
		async (t: TestContext) => {
			await using f = await fixture("old", true);
			await replace(f.location, "new");

			const respawned = f.database.respawn();

			const one = f.database.run(getBar);
			const many = unroll(f.database.run(getBars));

			await respawned;

			t.assert.deepStrictEqual(await one, ["new"]);
			t.assert.deepStrictEqual(await many, [["new"]]);
		},
	);

	await t.test("lets in-flight work finish", async (t: TestContext) => {
		await using f = await fixture("old", true);

		// a transaction holds its worker for as long as its body takes
		const { promise: reading, resolve: read } = Promise.withResolvers<void>();
		const { promise: held, resolve: proceed } = Promise.withResolvers<void>();

		const order: string[] = [];
		const transaction = f.database.begin(
			"r",
			async (tx) => {
				const before = await tx.run(getBar);
				read();
				await held;
				const after = await tx.run(getBar);

				order.push("transaction");
				return [before, after];
			},
			"background",
		);

		// deferred transaction pins nothing until it has read, so replacement has to happen after first statement rather than after `begin`
		await reading;
		await replace(f.location, "new");

		const respawning = f.database.respawn().then(() => {
			order.push("respawn");
		});

		proceed();

		await Promise.all([transaction, respawning]);

		// despawning before it settled would have torn the worker out from under it
		t.assert.deepStrictEqual(order, ["transaction", "respawn"]);
		// it keeps reading the file it started on, across the replacement
		t.assert.deepStrictEqual(await transaction, [["old"], ["old"]]);

		t.assert.deepStrictEqual(await f.database.run(getBar), ["new"]);
	});

	await t.test("joins a concurrent respawn", async (t: TestContext) => {
		await using f = await fixture("old", true);
		await replace(f.location, "new");

		const build = t.mock.method(Supervisor, "build");

		await Promise.all([f.database.respawn(), f.database.respawn()]);

		t.assert.strictEqual(build.mock.callCount(), 1);
		t.assert.deepStrictEqual(await f.database.run(getBar), ["new"]);
	});

	await t.test(
		"reopens the direct connection without a supervisor",
		async (t: TestContext) => {
			await using f = await fixture("old", false);
			await replace(f.location, "new");

			t.assert.deepStrictEqual(direct(f.database), [["old"]]);

			await f.database.respawn();

			t.assert.deepStrictEqual(direct(f.database), [["new"]]);

			// none was spawned before, none is brought up
			t.assert.throws(
				() => f.database.run(getBar),
				DatabaseSupervisorUnavailableError,
			);
		},
	);

	await t.test("rejects for in-memory databases", async (t: TestContext) => {
		const database = new Database(
			undefined,
			bake({ location: new URL("file:?mode=memory") }),
			{},
		);

		await t.assert.rejects(database.respawn(), DatabaseInMemoryReopenError);

		database.raw.close();
	});
});
