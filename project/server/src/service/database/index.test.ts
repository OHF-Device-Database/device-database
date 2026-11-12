import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, getActiveResourcesInfo } from "node:process";
import { type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import {
	Database,
	DatabaseInMemoryReopenError,
	DatabaseMoreThanOneError,
	DatabaseReadOnlyDomainError,
	DatabaseSupervisorUnavailableError,
	DatabaseSwappable,
	type IDatabase,
} from ".";
import { bake } from "./base";
import { DatabaseDomain, peek } from "./domain";
import { Supervisor } from "./supervisor";
import { testDatabase } from "./utility";

import type { BoundQuery, Query } from "./query";

logger.silent = true;

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
			await database.spawn();
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

test("generation", async (t: TestContext) => {
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

	/** reads through the direct connection rather than through a worker */
	const direct = (database: IDatabase<undefined>) => [
		...database.raw.query("select bar from foo", { returnArray: true }, {}),
	];

	const fixture = async (value: string, spawn: boolean) => {
		const directory = await mkdtemp(
			join(baseDirectory, "device-database-testing-"),
		);
		const domain = new DatabaseDomain(join(directory, "testing"));

		const database = new DatabaseSwappable(undefined, domain, {});
		database.raw.exec("create table foo (bar text not null) strict");
		database.raw.exec(`insert into foo values ('${value}')`);

		if (spawn) {
			await database.spawn();
		}

		return {
			database,
			domain,
			[Symbol.asyncDispose]: async () => {
				await database.despawn();
				database.raw.close();
				await rm(directory, { recursive: true, force: true });
			},
		};
	};

	await t.test("opens through the current symlink", async (t: TestContext) => {
		await using f = await fixture("old", false);

		// bootstrapping seeded `initial` and closed the connection it created the database with
		t.assert.strictEqual(
			f.domain.current && peek(f.domain.current).target,
			"initial",
		);
		// the live connection resolved the link, so it reports the real file
		t.assert.strictEqual(
			f.database.raw.location(),
			realpathSync(join(f.domain.root, "initial", "db")),
		);
	});

	await t.test("applies pragma overrides", async (t: TestContext) => {
		await using f = await fixture("old", false);

		await using generation = await f.database.copy({ journal_mode: "memory" });

		const [[journal]] = [
			...generation.raw.query("pragma journal_mode", { returnArray: true }, {}),
		] as string[][];
		t.assert.strictEqual(journal, "memory");

		// the live database keeps the mode it needs for concurrent access
		const [[live]] = [
			...f.database.raw.query("pragma journal_mode", { returnArray: true }, {}),
		] as string[][];
		t.assert.strictEqual(live, "wal");
	});

	await t.test(
		"starts out as a copy of the live database",
		async (t: TestContext) => {
			await using f = await fixture("old", false);

			await using generation = await f.database.copy();

			// the copy carries the write-ahead log, so it sees the row that was never checkpointed
			t.assert.deepStrictEqual(direct(generation), [["old"]]);
			// and it is a copy, not the same file
			t.assert.notStrictEqual(
				generation.raw.location(),
				f.database.raw.location(),
			);

			generation.raw.exec("update foo set bar = 'new'");
			// writes against the copy leave the live database alone
			t.assert.deepStrictEqual(direct(f.database), [["old"]]);
		},
	);

	await t.test("swaps a generation in", async (t: TestContext) => {
		await using f = await fixture("old", true);

		t.assert.deepStrictEqual(await f.database.run(getBar), ["old"]);

		const generation = await f.database.copy({ journal_mode: "memory" });
		generation.raw.exec("update foo set bar = 'new'");

		await f.database.swap(generation);

		t.assert.strictEqual(
			f.domain.current && peek(f.domain.current).target,
			peek(generation.generation).target,
		);
		// both the direct connection and every worker reopened through `current`
		t.assert.deepStrictEqual(direct(f.database), [["new"]]);
		t.assert.deepStrictEqual(await f.database.run(getBar), ["new"]);

		// the generation that was replaced is gone, sidecars and all
		t.assert.strictEqual(
			lstatSync(join(f.domain.root, "initial"), { throwIfNoEntry: false }),
			undefined,
		);

		// discarding a generation that has been swapped in would take the live database with it
		await generation.discard();
		t.assert.deepStrictEqual(direct(f.database), [["new"]]);
	});

	await t.test("swaps without a supervisor", async (t: TestContext) => {
		await using f = await fixture("old", false);

		const generation = await f.database.copy();
		generation.raw.exec("update foo set bar = 'new'");

		await f.database.swap(generation);

		t.assert.deepStrictEqual(direct(f.database), [["new"]]);
	});

	await t.test("discards an abandoned generation", async (t: TestContext) => {
		await using f = await fixture("old", false);

		let path: string;
		{
			await using generation = await f.database.copy();
			path = peek(generation.generation).path;
			t.assert.ok(lstatSync(path).isDirectory());
		}

		t.assert.strictEqual(lstatSync(path, { throwIfNoEntry: false }), undefined);
		// the live database was never touched
		t.assert.deepStrictEqual(direct(f.database), [["old"]]);
		t.assert.strictEqual(
			f.domain.current && peek(f.domain.current).target,
			"initial",
		);
	});

	await t.test(
		"refuses to build on a read-only domain",
		async (t: TestContext) => {
			const directory = await mkdtemp(
				join(baseDirectory, "device-database-testing-"),
			);
			const domain = new DatabaseDomain(join(directory, "testing"), true);

			const database = new DatabaseSwappable(undefined, domain, {});
			try {
				await t.assert.rejects(
					() => database.copy(),
					DatabaseReadOnlyDomainError,
				);
				await t.assert.rejects(
					// never reached, the gate is hit before the generation is looked at
					() => database.swap(undefined as never),
					DatabaseReadOnlyDomainError,
				);

				// nothing was laid down on the way out
				t.assert.deepStrictEqual(await domain.orphaned(), []);
			} finally {
				database.raw.close();
				await rm(directory, { recursive: true, force: true });
			}
		},
	);
});

test("attached domain", async (t: TestContext) => {
	const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

	const fixture = async () => {
		const directory = await mkdtemp(
			join(baseDirectory, "device-database-testing-"),
		);

		return {
			directory,
			attached: new DatabaseDomain(join(directory, "attached")),
			[Symbol.asyncDispose]: async () => {
				await rm(directory, { recursive: true, force: true });
			},
		};
	};

	await t.test("is bootstrapped on construction", async (t: TestContext) => {
		await using f = await fixture();

		const database = new Database(
			undefined,
			bake({ location: new URL("file:?mode=memory") }),
			{ other: f.attached },
		);

		// nothing laid the domain out beforehand, constructing the database did
		t.assert.ok(lstatSync(join(f.attached.root, "current")).isSymbolicLink());
		// and it was attached, so it can be queried across
		t.assert.deepStrictEqual(
			[
				...database.raw.query(
					"select count(*) from other.sqlite_schema",
					{ returnArray: true },
					{},
				),
			],
			[[0]],
		);

		database.raw.close();
	});

	await t.test("takes the mode of the domain", async (t: TestContext) => {
		await using f = await fixture();

		const writable = new Database(
			undefined,
			bake({ location: new URL("file:?mode=memory") }),
			{ other: f.attached },
		);
		writable.raw.exec("create table other.foo (bar text not null) strict");
		writable.raw.close();

		// the domain is what decides, one opened read-only holds everyone reaching through it to
		// reads rather than only the database that owns it
		const readOnly = new Database(
			undefined,
			bake({ location: new URL("file:?mode=memory") }),
			{ other: new DatabaseDomain(f.attached.root, true) },
		);
		t.assert.throws(() =>
			readOnly.raw.exec("insert into other.foo values ('written')"),
		);

		readOnly.raw.close();
	});

	await t.test("follows a swap of the domain", async (t: TestContext) => {
		await using f = await fixture();

		const owner = new DatabaseSwappable(undefined, f.attached, {});
		owner.raw.exec("create table foo (bar text not null) strict");
		owner.raw.exec("insert into foo values ('old')");

		// a file of its own, `respawn` rejects for in-memory databases
		const database = new Database(
			undefined,
			bake({ location: join(f.directory, "main.db") }),
			{ other: f.attached },
		);

		const read = () => [
			...database.raw.query(
				"select bar from other.foo",
				{ returnArray: true },
				{},
			),
		];
		t.assert.deepStrictEqual(read(), [["old"]]);

		const generation = await owner.copy();
		generation.raw.exec("update foo set bar = 'new'");
		await owner.swap(generation);

		// the attachment was opened through `current`, which SQLite resolves again on reopen
		await database.respawn();
		t.assert.deepStrictEqual(read(), [["new"]]);

		database.raw.close();
		owner.raw.close();
	});
});

test("aborted query lets go of its timer", async (t: TestContext) => {
	await using database = await testDatabase(undefined, false);
	const bound: BoundQuery<undefined, "one", "r", unknown> = {
		database: undefined,
		name: "GetOne",
		query: "select 1 as one union all select 2 as one",
		parameters: [],
		rowMode: "tuple",
		integerMode: "number",
		resultMode: "one",
		connectionMode: "r",
	};

	/** the "taking longer than expected" warning is backed by a timer */
	const timers = () =>
		getActiveResourcesInfo().filter((resource) => resource === "Timeout")
			.length;
	const pending = timers();

	await t.assert.rejects(database.run(bound), DatabaseMoreThanOneError);

	// a query that never produces a result still has clear its timer
	// leaking it would keep the process alive until it fires
	t.assert.strictEqual(timers(), pending);
});
