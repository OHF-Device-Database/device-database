import { type TestContext, test } from "node:test";

import { unroll } from "../../utility/iterable";
import { Database, type DatabaseTransaction } from "../database";
import { testDatabase } from "../database/utility";
import { Derive, DeriveWaitLateError } from ".";

import type { DeriveDerivable } from "./base";

test("plan", (t: TestContext) => {
	t.test("satisfiable", (t: TestContext) => {
		class A implements DeriveDerivable<undefined, typeof A> {
			static id = Symbol("A");
			static schedule = {} as const;

			static prerequisites = [];

			async derive(): Promise<void> {}
		}

		class B implements DeriveDerivable<undefined, typeof B> {
			static id = Symbol("B");
			static schedule = { minute: "30" } as const;

			static prerequisites = [A.id];

			async derive(): Promise<void> {}
		}

		class C implements DeriveDerivable<undefined, typeof C> {
			static id = Symbol("C");
			static schedule = {} as const;

			static prerequisites = [A.id];

			async derive(): Promise<void> {}
		}

		class D implements DeriveDerivable<undefined, typeof D> {
			static id = Symbol("D");
			static schedule = { minute: "*/2" } as const;

			static prerequisites = [C.id];

			async derive(): Promise<void> {}
		}

		const derive = new Derive(new Database(undefined, ":memory:", {}), [
			new A(),
			new B(),
			new C(),
			new D(),
		]);

		let epoch = derive.next(Derive.epoch(new Date("2026-03-03T17:29:00.000Z")));
		t.assert.deepStrictEqual(Derive.peek(epoch), {
			next: new Date("2026-03-03T17:30:00.000Z"),
		});
		let plan = derive.plan(epoch);
		t.assert.ok(Derive.viable(plan));
		t.assert.deepStrictEqual(
			Derive.peek(plan).pending.map((item) => item.id),
			[A.id, C.id, B.id, D.id],
		);
		t.assert.deepStrictEqual(
			Derive.peek(plan).reasons,
			new Map([
				[A.id, new Set(["schedule", "dependency"])],
				[B.id, new Set(["schedule"])],
				[C.id, new Set(["schedule", "dependency"])],
				[D.id, new Set(["schedule"])],
			]),
		);

		epoch = derive.next(epoch);
		t.assert.deepStrictEqual(Derive.peek(epoch), {
			next: new Date("2026-03-03T17:31:00.000Z"),
		});
		plan = derive.plan(epoch);
		t.assert.ok(Derive.viable(plan));
		t.assert.deepStrictEqual(
			Derive.peek(plan).pending.map((item) => item.id),
			[A.id, C.id],
		);
		t.assert.deepStrictEqual(
			Derive.peek(plan).reasons,
			new Map([
				[A.id, new Set(["schedule", "dependency"])],
				[C.id, new Set(["schedule"])],
			]),
		);

		epoch = derive.next(epoch);
		t.assert.deepStrictEqual(Derive.peek(epoch), {
			next: new Date("2026-03-03T17:32:00.000Z"),
		});
		plan = derive.plan(epoch);
		t.assert.ok(Derive.viable(plan));
		t.assert.deepStrictEqual(
			Derive.peek(plan).pending.map((item) => item.id),
			[A.id, C.id, D.id],
		);
		t.assert.deepStrictEqual(
			Derive.peek(plan).reasons,
			new Map([
				[A.id, new Set(["schedule", "dependency"])],
				[C.id, new Set(["schedule", "dependency"])],
				[D.id, new Set(["schedule"])],
			]),
		);

		epoch = derive.next(epoch);
		t.assert.deepStrictEqual(Derive.peek(epoch), {
			next: new Date("2026-03-03T17:33:00.000Z"),
		});
		plan = derive.plan(epoch);
		t.assert.ok(Derive.viable(plan));
		t.assert.deepStrictEqual(
			Derive.peek(plan).pending.map((item) => item.id),
			[A.id, C.id],
		);
		t.assert.deepStrictEqual(
			Derive.peek(plan).reasons,
			new Map([
				[A.id, new Set(["schedule", "dependency"])],
				[C.id, new Set(["schedule"])],
			]),
		);
	});

	test("wait", async (t: TestContext) => {
		t.test("not late", async (t: TestContext) => {
			t.mock.timers.enable({
				apis: ["setTimeout", "Date"],
				now: new Date("2026-03-03T17:29:00.000Z"),
			});

			class A implements DeriveDerivable<undefined, typeof A> {
				static id = Symbol("A");
				static schedule = {} as const;

				static prerequisites = [];

				async derive(): Promise<void> {}
			}

			const derive = new Derive(new Database(undefined, ":memory:", {}), [
				new A(),
			]);

			const waiting = derive.wait(Derive.epoch(), { late: "throw" });
			t.mock.timers.tick(60_000);
			t.assert.deepStrictEqual(
				await Promise.race([waiting, "sentinel"]),
				"sentinel",
			);

			const raced = await Promise.race([waiting, "sentinel"] as const);
			t.assert.ok(raced !== "sentinel");
			t.assert.deepStrictEqual(Derive.peek(raced), {
				next: new Date("2026-03-03T17:30:00.000Z"),
			});
		});

		t.test("late", async (t: TestContext) => {
			t.mock.timers.enable({
				apis: ["setTimeout", "Date"],
				now: new Date("2026-03-03T17:29:00.000Z"),
			});

			class A implements DeriveDerivable<undefined, typeof A> {
				static id = Symbol("A");
				static schedule = {} as const;

				static prerequisites = [];

				async derive(): Promise<void> {}
			}

			const derive = new Derive(new Database(undefined, ":memory:", {}), [
				new A(),
			]);

			const epoch = Derive.epoch();
			t.mock.timers.tick(60_000);
			await t.assert.rejects(
				derive.wait(epoch, { late: "throw" }),
				DeriveWaitLateError,
			);
		});
	});

	t.test("missing prerequisite", (t: TestContext) => {
		class A implements DeriveDerivable<undefined, typeof A> {
			static id = Symbol("A");
			static schedule = {} as const;

			static prerequisites = [];

			async derive(): Promise<void> {}
		}

		class B implements DeriveDerivable<undefined, typeof B> {
			static id = Symbol("B");
			static schedule = {} as const;

			static prerequisites = [A.id];

			async derive(): Promise<void> {}
		}

		const derive = new Derive(new Database(undefined, ":memory:", {}), [
			new B(),
		]);

		const epoch = Derive.epoch();
		const next = derive.next(epoch);
		const plan = derive.plan(next);

		t.assert.ok("kind" in plan && plan.kind === "missing-prerequisite");
	});

	t.test("circulary prerequisites", (t: TestContext) => {
		const bId = Symbol("B");

		class A implements DeriveDerivable<undefined, typeof A> {
			static id = Symbol("A");
			static schedule = {} as const;

			static prerequisites = [bId];

			async derive(): Promise<void> {}
		}

		class B implements DeriveDerivable<undefined, typeof B> {
			static id = bId;
			static schedule = {} as const;

			static prerequisites = [A.id];

			async derive(): Promise<void> {}
		}

		const derive = new Derive(new Database(undefined, ":memory:", {}), [
			new A(),
			new B(),
		]);

		const epoch = Derive.epoch();
		const next = derive.next(epoch);
		const plan = derive.plan(next);
		t.assert.ok("kind" in plan && plan.kind === "circulary-prerequisites");
	});
});

test("act", async (t: TestContext) => {
	await using db = await testDatabase(undefined, false);
	db.raw.exec(
		"create table a (value text primary key not null) strict, without rowid",
	);
	db.raw.exec(
		"create table b (value text primary key not null) strict, without rowid",
	);

	const mockA = t.mock.fn<
		(t: DatabaseTransaction<undefined, "w">) => Promise<void>
	>(async (t: DatabaseTransaction<undefined, "w">) => {
		await t.run({
			database: undefined,
			name: "InsertA",
			query: "insert into a values ('foo')",
			connectionMode: "w",
			parameters: [],
			rowMode: "tuple",
			resultMode: "none",
			integerMode: "number",
		});
	});
	class A implements DeriveDerivable<undefined, typeof A> {
		static id = Symbol("A");
		static schedule = {} as const;

		static prerequisites = [];

		derive = mockA;
	}

	const mockB = t.mock.fn<
		(t: DatabaseTransaction<undefined, "w">) => Promise<void>
	>(async (t: DatabaseTransaction<undefined, "w">) => {
		await t.run({
			database: undefined,
			name: "InsertB",
			query: "insert into b select value from a",
			connectionMode: "w",
			parameters: [],
			rowMode: "tuple",
			resultMode: "none",
			integerMode: "number",
		});
	});
	class B implements DeriveDerivable<undefined, typeof B> {
		static id = Symbol("B");
		static schedule = {} as const;

		static prerequisites = [A.id];

		derive = mockB;
	}

	const derive = new Derive(db, [new A(), new B()]);

	const next = derive.next(Derive.epoch());
	const plan = derive.plan(next);
	t.assert.ok(Derive.viable(plan));

	t.assert.partialDeepStrictEqual(await unroll(derive.act(plan)), [
		{ id: A.id },
		{ id: B.id },
	]);

	t.assert.deepStrictEqual(mockA.mock.callCount(), 1);
	t.assert.deepStrictEqual(mockB.mock.callCount(), 1);

	t.assert.deepStrictEqual(
		[...db.raw.query("select value from b", { returnArray: true }, {})],
		[["foo"]],
	);
});
