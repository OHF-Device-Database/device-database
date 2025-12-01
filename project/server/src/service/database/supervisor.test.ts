import { describe, type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { unroll } from "../../utility/iterable";
import { testDatabase } from "./utility";

test("write transaction", async (t: TestContext) => {
	await describe("implicit commit", async () => {
		await using database = await testDatabase(false, false);
		database.raw.exec("create table foo (bar text);");

		await database.begin("w", async (transaction) => {
			await transaction.run({
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
		await using database = await testDatabase(false, false);
		database.raw.exec("create table foo (bar text);");

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
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
		await using database = await testDatabase(false, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "one",
					connectionMode: "w",
				});
			}),
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
		await using database = await testDatabase(false, false);
		await t.assert.rejects(
			database.run({
				name: "",
				query: "insert into foo (bar) values ('baz')",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "one",
				connectionMode: "w",
			}),
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
		await using database = await testDatabase(false, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				return await unroll(
					transaction.run({
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
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
		await using database = await testDatabase(false, false);
		await t.assert.rejects(
			unroll(
				database.run({
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "many",
					connectionMode: "w",
				}),
			),
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
		await using database = await testDatabase(false, false);

		await t.assert.rejects(
			database.begin("w", async (transaction) => {
				await transaction.run({
					name: "",
					query: "insert into foo (bar) values ('baz')",
					parameters: [],
					rowMode: "object",
					integerMode: "number",
					resultMode: "none",
					connectionMode: "w",
				});
			}),
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
		await using database = await testDatabase(false, false);
		await t.assert.rejects(
			database.run({
				name: "",
				query: "insert into foo (bar) values ('baz')",
				parameters: [],
				rowMode: "object",
				integerMode: "number",
				resultMode: "none",
				connectionMode: "w",
			}),
			{ name: "Error", message: "no such table: foo" },
		);

		t.assert.deepStrictEqual(
			await database.run({
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
