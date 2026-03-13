import { describe, type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { unroll } from "../../utility/iterable";
import { testDatabase } from "./utility";

test("write transaction", async (t: TestContext) => {
	await describe("implicit commit", async () => {
		await using database = await testDatabase(undefined, false);
		database.raw.exec("create table foo (bar text);");

		await database.begin("w", async (transaction) => {
			await transaction.run({
				database: undefined,
				name: "",
				query: "insert into foo (bar) values ('baz')",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			});
		});

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select bar from foo;",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "r",
			}),
			{ bar: "baz" },
		);
	});

	await describe("implicit rollback", async () => {
		await using database = await testDatabase(undefined, false);
		database.raw.exec("create table foo (bar text);");

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
					database: undefined,
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "one",
					connectionMode: "w",
				});

				throw new Error("foo");
			}),
			{ name: "Error", message: "foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select bar from foo;",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "r",
			}),
			null,
		);
	});
});

test("worker crash", async (t: TestContext) => {
	logger.level = "critical";

	describe("one / transaction", async () => {
		await using database = await testDatabase(undefined, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
					database: undefined,
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "one",
					connectionMode: "w",
				});
			}),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});

	describe("one / no transaction", async () => {
		await using database = await testDatabase(undefined, false);
		await t.assert.rejects(
			database.run({
				database: undefined,
				name: "",
				query: "insert into foo (bar) values ('baz')",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});

	describe("many / transaction", async () => {
		await using database = await testDatabase(undefined, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				return await unroll(
					transaction.run({
						database: undefined,
						name: "",
						query: "insert into foo (bar) values ('baz')",
						parameters: [],
						rowMode: "object",
						integerMode: "number",
						resultMode: "many",
						connectionMode: "w",
					}),
				);
			}),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});

	describe("many / no transaction", async () => {
		await using database = await testDatabase(undefined, false);
		await t.assert.rejects(
			unroll(
				database.run({
					database: undefined,
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "many",
					connectionMode: "w",
				}),
			),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});

	describe("none / transaction", async () => {
		await using database = await testDatabase(undefined, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
					database: undefined,
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "none",
					connectionMode: "w",
				});
			}),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});

	describe("none / no transaction", async () => {
		await using database = await testDatabase(undefined, false);
		await t.assert.rejects(
			database.run({
				database: undefined,
				name: "",
				query: "insert into foo (bar) values ('baz')",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "none",
				connectionMode: "w",
			}),
			(err: any) => {
				t.assert.deepStrictEqual(err.message, "worker crashed");
				t.assert.deepStrictEqual(err.cause.message, "no such table: foo");
				return true;
			},
		);

		t.assert.deepStrictEqual(
			await database.run({
				database: undefined,
				name: "",
				query: "select 1",
				parameters: [],
				rowMode: "tuple",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			[1],
		);
	});
});

test("premature stopped iteration", async (t: TestContext) => {
	await using database = await testDatabase(undefined, false);

	{
		const iterable = database.run({
			database: undefined,
			name: "",
			query: "select column1 from (values (1), (2), (3))",
			parameters: [],
			rowMode: "tuple",
			integerMode: "number",
			resultMode: "many",
			connectionMode: "r",
		});

		for await (const row of iterable) {
			t.assert.deepStrictEqual(row, [1]);
			break;
		}
	}

	{
		const result = await database.run({
			database: undefined,
			name: "",
			query: "select column1 from (values (1))",
			parameters: [],
			rowMode: "tuple",
			integerMode: "number",
			resultMode: "one",
			connectionMode: "r",
		});

		t.assert.deepStrictEqual(result, [1]);
	}
});

test("background priority", async (t: TestContext) => {
	await using database = await testDatabase(undefined, false);

	await describe("one / transaction", async () => {
		const result = await database.begin(
			"r",
			async (db) =>
				await db.run({
					database: undefined,
					name: "",
					query: "select 1 as one",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "one",
					connectionMode: "r",
				}),
			"background",
		);

		t.assert.partialDeepStrictEqual(result, { one: 1 });
	});

	await describe("one / no transaction", async () => {
		const result = await database.run(
			{
				database: undefined,
				name: "",
				query: "select 1 as one",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "r",
			},
			"background",
		);
		// node:sqlite returns `[Object: null prototype]` objects
		t.assert.partialDeepStrictEqual(result, { one: 1 });
	});
});
