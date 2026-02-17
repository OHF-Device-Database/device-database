import { COPYFILE_FICLONE_FORCE } from "node:constants";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { type TestContext, test } from "node:test";

import { isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import {
	Database,
	DatabaseInMemorySnapshotError,
	DatabaseMoreThanOneError,
} from ".";
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
		"one",
		"r",
		GetOneParametersNamed,
		GetOneParametersAnonymous,
		GetOneRecordRowModeObjectIntegerModeNumber,
		GetOneRecordRowModeObjectIntegerModeBigInt,
		GetOneRecordRowModeTupleIntegerModeNumber,
		GetOneRecordRowModeTupleIntegerModeBigInt
	> = {
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
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeBigInt> => {
				return {
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
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeBigInt> => {
				return {
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

	await using database = await testDatabase(false, false);

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
		"one",
		"r",
		GetOneParametersNamed,
		GetOneParametersAnonymous,
		GetOneRecordRowModeObjectIntegerModeNumber,
		GetOneRecordRowModeObjectIntegerModeBigInt,
		GetOneRecordRowModeTupleIntegerModeNumber,
		GetOneRecordRowModeTupleIntegerModeBigInt
	> = {
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
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeBigInt> => {
				return {
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
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<"one", "r", GetOneRecordRowModeTupleIntegerModeBigInt> => {
				return {
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

	await using database = await testDatabase(false, false);

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
		"many",
		"r",
		GetManyParametersNamed,
		GetManyParametersAnonymous,
		GetManyRecordRowModeObjectIntegerModeNumber,
		GetManyRecordRowModeObjectIntegerModeBigInt,
		GetManyRecordRowModeTupleIntegerModeNumber,
		GetManyRecordRowModeTupleIntegerModeBigInt
	> = {
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
				| BoundQuery<"many", "r", GetManyRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"many", "r", GetManyRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"many", "r", GetManyRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
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
				| BoundQuery<"many", "r", GetManyRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"many", "r", GetManyRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"many", "r", GetManyRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<
						"many",
						"r",
						GetManyRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
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

	await using database = await testDatabase(false, false);

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
		"none",
		"r",
		GetNoneParametersNamed,
		GetNoneParametersAnonymous,
		GetNoneRecordRowModeObjectIntegerModeNumber,
		GetNoneRecordRowModeObjectIntegerModeBigInt,
		GetNoneRecordRowModeTupleIntegerModeNumber,
		GetNoneRecordRowModeTupleIntegerModeBigInt
	> = {
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
				| BoundQuery<"none", "r", GetNoneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"none", "r", GetNoneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"none", "r", GetNoneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
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
				| BoundQuery<"none", "r", GetNoneRecordRowModeObjectIntegerModeNumber>
				| BoundQuery<"none", "r", GetNoneRecordRowModeObjectIntegerModeBigInt>
				| BoundQuery<"none", "r", GetNoneRecordRowModeTupleIntegerModeNumber>
				| BoundQuery<
						"none",
						"r",
						GetNoneRecordRowModeTupleIntegerModeBigInt
				  > => {
				return {
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

	await using database = await testDatabase(false, false);

	{
		const result = await database.run(getNone.bind.anonymous([]));
		t.assert.strictEqual(result, undefined);
	}
});

test("snapshot", async (t: TestContext) => {
	t.test("in-memory database", async (t) => {
		const db = new Database(":memory:", false);
		t.assert.rejects(db.snapshot("foo"), DatabaseInMemorySnapshotError);
	});

	t.test("persistent database", async (t: TestContext) => {
		const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

		// determine if reflinks are available, otherwise skip test
		let reflinked = false;
		{
			const dir = await mkdtemp(join(baseDirectory, "reflink-probe"));
			const src = join(dir, "src");
			const dest = join(dir, "dest");

			await writeFile(src, "foo");

			try {
				await copyFile(src, dest, COPYFILE_FICLONE_FORCE);
				reflinked = true;
			} catch {
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}

		if (!reflinked) {
			t.skip("reflinks not supported on host filesystem");
			return;
		}

		const expected = randomUUID();
		const unexpected = randomUUID();

		const db1 = await testDatabase(false, false);

		const location = db1.raw.location();
		t.assert.ok(isSome(location));

		const db2 = new Database(location, false);

		// disable automatic checkpointing, to simulate an outstanding checkpoint
		db1.raw.exec("pragma wal_autocheckpoint=0");
		db1.raw.exec("create table foo (bar text)");
		db1.raw.query(
			"insert into foo (bar) values (:bar)",
			{ returnArray: false },
			{ bar: expected },
		);

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

				const db3 = new Database(location, false);

				const result = db3.raw.query(
					"select bar from foo",
					{ returnArray: true },
					{},
				);
				t.assert.deepStrictEqual(result, [[expected]]);

				db3.raw.close();
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});
});
