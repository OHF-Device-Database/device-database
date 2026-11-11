import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, getActiveResourcesInfo } from "node:process";
import { describe, type TestContext, test } from "node:test";
import { setImmediate as tick } from "node:timers/promises";

import { logger } from "../../logger";
import { unroll } from "../../utility/iterable";
import { StubIntrospection } from "../introspect/stub";
import { bake } from "./base";
import {
	Supervisor,
	SupervisorDespawnedError,
	WorkerCrashedError,
} from "./supervisor";
import { testDatabase } from "./utility";

import type { BoundQuery } from "./query";

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

const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

const selectOne: BoundQuery<undefined, "one", "r", unknown> = {
	database: undefined,
	name: "SelectOne",
	query: "select 1",
	parameters: [],
	connectionMode: "r",
	resultMode: "one",
	rowMode: "tuple",
	integerMode: "number",
};

const fixture = async () => {
	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-"),
	);

	const supervisor = await Supervisor.build(
		undefined,
		bake({ location: join(directory, "testing.db") }),
		{},
		{},
		{ default: 1, background: 1 },
		new StubIntrospection(),
	);

	return {
		supervisor,
		[Symbol.asyncDispose]: async () => {
			await supervisor.despawn();
			await rm(directory, { recursive: true, force: true });
		},
	};
};

/** holds a worker of the background pool until `release` is called */
const occupy = async (supervisor: Supervisor) => {
	const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
	const { promise: held, resolve: release } = Promise.withResolvers<void>();

	const work = supervisor.begin(
		"r",
		async (transaction) => {
			// a deferred transaction pins nothing until its first statement
			await transaction.run(selectOne);
			enter();
			await held;
		},
		"background",
	);

	await entered;

	return { work, release };
};

test("drained", async (t: TestContext) => {
	await t.test("waits for in-flight work", async (t: TestContext) => {
		await using f = await fixture();
		const { work, release } = await occupy(f.supervisor);

		let completed = false;
		const drained = f.supervisor.drained().then(() => {
			completed = true;
		});

		// the worker is held by the main thread, no amount of turns frees it
		await tick();
		t.assert.strictEqual(completed, false);

		release();

		await work;
		await drained;

		t.assert.strictEqual(completed, true);
	});

	await t.test(
		"shares one drain between concurrent callers",
		async (t: TestContext) => {
			await using f = await fixture();
			const { work, release } = await occupy(f.supervisor);

			const drain = t.mock.method(
				f.supervisor as unknown as { drain: () => Promise<void> },
				"drain",
			);

			const drained = Promise.all([
				f.supervisor.drained(),
				f.supervisor.drained(),
				f.supervisor.drained(),
			]);

			release();
			await work;
			await drained;

			t.assert.strictEqual(drain.mock.callCount(), 1);

			// the drain is let go of once it settled, rather than lingering
			await f.supervisor.drained();
			t.assert.strictEqual(drain.mock.callCount(), 1);
		},
	);

	await t.test("rejects when despawned", async (t: TestContext) => {
		await using f = await fixture();
		// the transaction is never released, its worker goes down underneath it
		await occupy(f.supervisor);

		const drained = t.assert.rejects(
			f.supervisor.drained(),
			SupervisorDespawnedError,
		);

		await f.supervisor.despawn();
		await drained;

		await t.assert.rejects(f.supervisor.drained(), SupervisorDespawnedError);
	});
});

test("crashing worker", async (t: TestContext) => {
	await t.test(
		"only lets go of the timers of its own steps",
		async (t: TestContext) => {
			logger.level = "critical";

			await using f = await fixture();

			const { promise: entered, resolve: enter } =
				Promise.withResolvers<void>();
			const { promise: held, resolve: release } = Promise.withResolvers<void>();

			// a partially consumed result keeps its step - and therefore its timer -
			// in flight on the background worker
			const work = f.supervisor.begin(
				"r",
				async (transaction) => {
					for await (const row of transaction.run({
						...selectOne,
						name: "SelectRows",
						query: "select column1 from (values (1), (2), (3))",
						resultMode: "many",
					} as BoundQuery<undefined, "many", "r", unknown>)) {
						void row;
						enter();
						await held;
					}
				},
				"background",
			);

			await entered;

			/** the "taking longer than expected" warning is backed by a timer */
			const timers = () =>
				getActiveResourcesInfo().filter((resource) => resource === "Timeout")
					.length;
			const pending = timers();

			// brings the worker of the default pool down, the background one is untouched
			const crash = f.supervisor.run({
				...selectOne,
				name: "InsertMissing",
				query: "insert into foo (bar) values ('baz')",
			}) as Promise<unknown>;
			await t.assert.rejects(crash, WorkerCrashedError);

			t.assert.strictEqual(timers(), pending);

			release();
			await work;

			// the step completed, its timer must be gone by now
			t.assert.strictEqual(timers(), pending - 1);

			// settle the replacement worker before tearing the fixture down
			await f.supervisor.run(selectOne);
		},
	);
});

test("despawn with work in flight", async (t: TestContext) => {
	await t.test(
		"fails the transaction rather than hanging on it",
		{ timeout: 10_000 },
		async (t: TestContext) => {
			await using f = await fixture();
			const { work, release } = await occupy(f.supervisor);

			// a terminated worker never acknowledges the commit it was asked for
			await f.supervisor.despawn();
			release();

			await t.assert.rejects(work, WorkerCrashedError);
		},
	);
});
