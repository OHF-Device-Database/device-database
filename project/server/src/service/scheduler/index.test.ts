import { type TestContext, test } from "node:test";

import { unroll } from "../../utility/iterable";
import { testDatabase } from "../database/utility";
import { StubIntrospection } from "../introspect/stub";
import { Scheduler, SchedulerWaitLateError } from ".";

import type { SchedulerScheduled } from "./base";

test("plan", (t: TestContext) => {
	// unscheduled scheduled units are not included in plan unless they are a prerequisite of another scheduled unit
	t.test("unscheduled", (t: TestContext) => {
		class A implements SchedulerScheduled<typeof A> {
			static id = Symbol("A");

			static prerequisites = [];

			async run(): Promise<void> {}
		}

		class B implements SchedulerScheduled<typeof B> {
			static id = Symbol("B");
			static schedule = { minute: "30" } as const;

			static prerequisites = [A.id];

			async run(): Promise<void> {}
		}

		{
			const scheduler = new Scheduler([new A()], new StubIntrospection());

			const epoch = scheduler.next(
				Scheduler.epoch(new Date("2026-03-03T17:29:00.000Z")),
			);
			const plan = scheduler.plan(epoch);
			t.assert.ok(Scheduler.viable(plan));
			t.assert.deepStrictEqual(
				Scheduler.peek(plan).pending.map((item) => item.id),
				[],
			);
		}

		{
			const scheduler = new Scheduler(
				[new A(), new B()],
				new StubIntrospection(),
			);

			const epoch = scheduler.next(
				Scheduler.epoch(new Date("2026-03-03T17:29:00.000Z")),
			);
			t.assert.deepStrictEqual(Scheduler.peek(epoch), {
				next: new Date("2026-03-03T17:30:00.000Z"),
			});
			const plan = scheduler.plan(epoch);
			t.assert.ok(Scheduler.viable(plan));
			t.assert.deepStrictEqual(
				Scheduler.peek(plan).pending.map((item) => item.id),
				[A.id, B.id],
			);
		}
	});

	t.test("satisfiable", (t: TestContext) => {
		class A implements SchedulerScheduled<typeof A> {
			static id = Symbol("A");

			static prerequisites = [];

			async run(): Promise<void> {}
		}

		class B implements SchedulerScheduled<typeof B> {
			static id = Symbol("B");
			static schedule = { minute: "30" } as const;

			static prerequisites = [A.id];

			async run(): Promise<void> {}
		}

		class C implements SchedulerScheduled<typeof C> {
			static id = Symbol("C");
			static schedule = {} as const;

			static prerequisites = [A.id];

			async run(): Promise<void> {}
		}

		class D implements SchedulerScheduled<typeof D> {
			static id = Symbol("D");
			static schedule = { minute: "*/2" } as const;

			static prerequisites = [C.id];

			async run(): Promise<void> {}
		}

		const scheduler = new Scheduler(
			[new A(), new B(), new C(), new D()],
			new StubIntrospection(),
		);

		let epoch = scheduler.next(
			Scheduler.epoch(new Date("2026-03-03T17:29:00.000Z")),
		);
		t.assert.deepStrictEqual(Scheduler.peek(epoch), {
			next: new Date("2026-03-03T17:30:00.000Z"),
		});
		let plan = scheduler.plan(epoch);
		t.assert.ok(Scheduler.viable(plan));
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).pending.map((item) => item.id),
			[A.id, C.id, B.id, D.id],
		);
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).reasons,
			new Map([
				[A.id, new Set(["dependency"])],
				[B.id, new Set(["schedule"])],
				[C.id, new Set(["schedule", "dependency"])],
				[D.id, new Set(["schedule"])],
			]),
		);

		epoch = scheduler.next(epoch);
		t.assert.deepStrictEqual(Scheduler.peek(epoch), {
			next: new Date("2026-03-03T17:31:00.000Z"),
		});
		plan = scheduler.plan(epoch);
		t.assert.ok(Scheduler.viable(plan));
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).pending.map((item) => item.id),
			[A.id, C.id],
		);
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).reasons,
			new Map([
				[A.id, new Set(["dependency"])],
				[C.id, new Set(["schedule"])],
			]),
		);

		epoch = scheduler.next(epoch);
		t.assert.deepStrictEqual(Scheduler.peek(epoch), {
			next: new Date("2026-03-03T17:32:00.000Z"),
		});
		plan = scheduler.plan(epoch);
		t.assert.ok(Scheduler.viable(plan));
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).pending.map((item) => item.id),
			[A.id, C.id, D.id],
		);
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).reasons,
			new Map([
				[A.id, new Set(["dependency"])],
				[C.id, new Set(["schedule", "dependency"])],
				[D.id, new Set(["schedule"])],
			]),
		);

		epoch = scheduler.next(epoch);
		t.assert.deepStrictEqual(Scheduler.peek(epoch), {
			next: new Date("2026-03-03T17:33:00.000Z"),
		});
		plan = scheduler.plan(epoch);
		t.assert.ok(Scheduler.viable(plan));
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).pending.map((item) => item.id),
			[A.id, C.id],
		);
		t.assert.deepStrictEqual(
			Scheduler.peek(plan).reasons,
			new Map([
				[A.id, new Set(["dependency"])],
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

			class A implements SchedulerScheduled<typeof A> {
				static id = Symbol("A");
				static schedule = {} as const;

				static prerequisites = [];

				async run(): Promise<void> {}
			}

			const scheduler = new Scheduler([new A()], new StubIntrospection());

			const waiting = scheduler.wait(Scheduler.epoch(), { late: "throw" });
			t.mock.timers.tick(60_000);
			t.assert.deepStrictEqual(
				await Promise.race([waiting, "sentinel"]),
				"sentinel",
			);

			const raced = await Promise.race([waiting, "sentinel"] as const);
			t.assert.ok(raced !== "sentinel");
			t.assert.deepStrictEqual(Scheduler.peek(raced), {
				next: new Date("2026-03-03T17:30:00.000Z"),
			});
		});

		t.test("late", async (t: TestContext) => {
			t.mock.timers.enable({
				apis: ["setTimeout", "Date"],
				now: new Date("2026-03-03T17:29:00.000Z"),
			});

			class A implements SchedulerScheduled<typeof A> {
				static id = Symbol("A");
				static schedule = {} as const;

				static prerequisites = [];

				async run(): Promise<void> {}
			}

			const scheduler = new Scheduler([new A()], new StubIntrospection());

			const epoch = Scheduler.epoch();
			t.mock.timers.tick(60_000);
			await t.assert.rejects(
				scheduler.wait(epoch, { late: "throw" }),
				SchedulerWaitLateError,
			);
		});
	});

	t.test("missing prerequisite", (t: TestContext) => {
		class A implements SchedulerScheduled<typeof A> {
			static id = Symbol("A");
			static schedule = {} as const;

			static prerequisites = [];

			async run(): Promise<void> {}
		}

		class B implements SchedulerScheduled<typeof B> {
			static id = Symbol("B");
			static schedule = {} as const;

			static prerequisites = [A.id];

			async run(): Promise<void> {}
		}

		const scheduler = new Scheduler([new B()], new StubIntrospection());

		const epoch = Scheduler.epoch();
		const next = scheduler.next(epoch);
		const plan = scheduler.plan(next);

		t.assert.ok("kind" in plan && plan.kind === "missing-prerequisite");
	});

	t.test("circular prerequisites", (t: TestContext) => {
		const bId = Symbol("B");

		class A implements SchedulerScheduled<typeof A> {
			static id = Symbol("A");
			static schedule = {} as const;

			static prerequisites = [bId];

			async run(): Promise<void> {}
		}

		class B implements SchedulerScheduled<typeof B> {
			static id = bId;
			static schedule = {} as const;

			static prerequisites = [A.id];

			async run(): Promise<void> {}
		}

		const scheduler = new Scheduler(
			[new A(), new B()],
			new StubIntrospection(),
		);

		const epoch = Scheduler.epoch();
		const next = scheduler.next(epoch);
		const plan = scheduler.plan(next);
		t.assert.ok("kind" in plan && plan.kind === "circular-prerequisites");
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

	const runA = t.mock.fn<() => Promise<void>>(async () => {
		await db.begin("w", async (t) => {
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
	});
	class A implements SchedulerScheduled<typeof A> {
		static id = Symbol("A");
		static schedule = {} as const;

		static prerequisites = [];

		run = runA;
	}

	const runB = t.mock.fn<() => Promise<void>>(async () => {
		await db.begin("w", async (t) => {
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
	});
	class B implements SchedulerScheduled<typeof B> {
		static id = Symbol("B");
		static schedule = {} as const;

		static prerequisites = [A.id];

		run = runB;
	}

	const scheduler = new Scheduler([new A(), new B()], new StubIntrospection());

	const next = scheduler.next(Scheduler.epoch());
	const plan = scheduler.plan(next);
	t.assert.ok(Scheduler.viable(plan));

	t.assert.partialDeepStrictEqual(await unroll(scheduler.act(plan)), [
		{ id: A.id },
		{ id: B.id },
	]);

	t.assert.deepStrictEqual(runA.mock.callCount(), 1);
	t.assert.deepStrictEqual(runB.mock.callCount(), 1);

	t.assert.deepStrictEqual(
		[...db.raw.query("select value from b", { returnArray: true }, {})],
		[["foo"]],
	);
});
