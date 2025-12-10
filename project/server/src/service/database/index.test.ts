import assert from "node:assert";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { type TestContext, test } from "node:test";

import { unroll } from "../../utility/iterable";
import { Database, DatabaseMoreThanOneError } from ".";
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

test("backup", async (t: TestContext) => {
	const buildDatabase = (path: string = ":memory:", readOnly = false) => {
		return new Database(path, readOnly, false);
	};

	{
		const db = buildDatabase();
		t.assert.strictEqual(
			db.snapshot(),
			null,
			"in-memory databases not supported",
		);
	}

	{
		// required because in-memory databases are unsupported by backup method
		const dir = await mkdtemp(join(tmpdir(), "device-database-testing"));
		const pathOriginal = join(dir, "original.db");
		const pathBackup = join(dir, "backup.db");

		try {
			const db1 = buildDatabase(pathOriginal);
			db1.raw.exec(
				"create table foo (bar text); insert into foo (bar) values ('baz');",
			);

			// biome-ignore lint/style/noNonNullAssertion: not an in-memory database
			const stream = db1
				.snapshot()!
				.pipe(createWriteStream(pathBackup, { encoding: "binary" }));

			await new Promise<void>((resolve) =>
				stream.once("close", () => resolve()),
			);

			const db2 = buildDatabase(pathBackup, true);

			t.assert.deepStrictEqual(
				[...db2.raw.query("select bar from foo", { returnArray: true }, {})],
				[["baz"]],
				"backup restored",
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}

	{
		// required because in-memory databases are unsupported by backup method
		const dir = await mkdtemp(join(tmpdir(), "device-database-testing"));
		const path = join(dir, "database.db");

		try {
			const db = buildDatabase(path);
			const controller = new AbortController();
			controller.abort();

			try {
				// biome-ignore lint/style/noNonNullAssertion: not an in-memory database
				await buffer(db.snapshot(controller.signal)!);
			} catch (e) {
				assert(e instanceof Error);
				t.assert.strictEqual(e.name, "AbortError");
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}
});
