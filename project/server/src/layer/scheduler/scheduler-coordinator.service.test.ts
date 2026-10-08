import { type TestContext, test } from "node:test";

import type { PickDeep } from "type-fest";

import { logger } from "../../logger";
import { StubIntrospection } from "../../service/introspect/stub";
import { Scheduler } from "../../service/scheduler";
import { Suspendable, SuspendableHandle } from "../../service/suspendable";
import race from "../../utility/race-as-promised";
import { ServiceSchedulerCoordinator } from "./scheduler-coordinator.service";

import type { SchedulerEpoch } from "../../service/scheduler";
import type { Config } from "../config/config.module";
import type { ServiceLockfileCoordinator } from "../database/lockfile-coordinator.service";
import type { ServiceSnapshotDeferIngest } from "../snapshot/defer/ingest.service";
import type { ServiceScheduler } from "./scheduler.service";

logger.silent = true;

/** sits on a minute boundary, so a `{ minute: "*" }` unit is pending for it */
const SLOT = new Date("2026-03-03T17:30:00.000Z");

const PendingSymbol = Symbol("Pending");
type PendingSymbol = typeof PendingSymbol;

/** resolves to {@link PendingSymbol} unless `promise` settles first */
const pending = <T>(promise: Promise<T>): Promise<T | PendingSymbol> =>
	race([
		promise,
		new Promise<PendingSymbol>((resolve) =>
			setTimeout(() => resolve(PendingSymbol), 0),
		),
	]);

/** yields to the event loop, draining every microtask the coordinator queued */
const flush = (): Promise<void> =>
	new Promise<void>((resolve) => setTimeout(resolve, 0));

/** blocks inside a scheduled unit until released */
const holding = () => {
	const entered = Promise.withResolvers<void>();
	const released = Promise.withResolvers<void>();

	return {
		/** resolves once the unit is running */
		entered: entered.promise,
		release: () => released.resolve(),
		run: async () => {
			entered.resolve();

			await released.promise;
		},
	};
};

/** hands out slots on demand, so the loop only advances when a test says so */
class TestScheduler extends Scheduler {
	public waits = 0;

	private credits = 0;
	private waiting: (() => void) | undefined;

	override async wait(): Promise<SchedulerEpoch> {
		this.waits++;

		if (this.credits === 0) {
			const { resolve, promise: slot } = Promise.withResolvers<void>();
			this.waiting = resolve;

			await slot;
		}
		this.credits--;

		return Scheduler.epoch(SLOT);
	}

	/** releases one slot, buffering it when the loop has not reached `wait` yet */
	tick(): void {
		this.credits++;

		const waiting = this.waiting;
		this.waiting = undefined;

		waiting?.();
	}
}

/** stands in for the ingest, which the coordinator only ever suspends and resumes */
class TestIngest extends Suspendable {
	override drain(): Promise<void> {
		return Promise.resolve();
	}
}

const buildHarness = (
	options?:
		| {
				enable?: boolean | undefined;
				run?: (() => Promise<void>) | undefined;
		  }
		| undefined,
) => {
	const unlocking = Promise.withResolvers<void>();

	const id = Symbol("unit");
	const runs: symbol[] = [];

	const body = options?.run;

	class Unit {
		static readonly id = id;
		static readonly schedule = { minute: "*" } as const;
		static readonly prerequisites: readonly symbol[] = [];

		async run(): Promise<void> {
			runs.push(id);

			await body?.();
		}
	}

	const scheduler = new TestScheduler([new Unit()], new StubIntrospection());
	const ingest = new TestIngest();

	const coordinator = new ServiceSchedulerCoordinator(
		{
			scheduler: { enable: options?.enable ?? true },
		} as unknown as PickDeep<Config, "scheduler.enable">,
		scheduler as unknown as ServiceScheduler,
		{
			unlocked: unlocking.promise,
		} as unknown as ServiceLockfileCoordinator,
		ingest as unknown as ServiceSnapshotDeferIngest,
	);

	return {
		coordinator,
		scheduler,
		ingest,
		runs,
		id,
		/** releases the lockfile the loop waits on before scheduling */
		unlock: () => unlocking.resolve(),
		/** releases one scheduled slot */
		tick: () => scheduler.tick(),
	};
};

test("lifecycle", (t: TestContext) => {
	t.test("does not schedule when disabled", async (t: TestContext) => {
		const h = buildHarness({ enable: false });

		h.unlock();
		h.tick();
		await flush();

		t.assert.strictEqual(h.scheduler.waits, 0);
		t.assert.deepStrictEqual(h.runs, []);
		t.assert.notStrictEqual(
			await pending(h.coordinator.drain()),
			PendingSymbol,
		);
	});

	t.test("waits for the lockfile before scheduling", async (t: TestContext) => {
		const h = buildHarness();

		h.tick();
		await flush();

		t.assert.strictEqual(h.scheduler.waits, 0);
		t.assert.deepStrictEqual(h.runs, []);

		h.unlock();
		await flush();

		// the buffered slot is picked up, and the loop is back waiting for the next one
		t.assert.strictEqual(h.scheduler.waits, 2);
		t.assert.deepStrictEqual(h.runs, [h.id]);
	});

	t.test("acts on every slot", async (t: TestContext) => {
		const h = buildHarness();

		h.unlock();
		await flush();

		t.assert.strictEqual(h.scheduler.waits, 1);
		t.assert.deepStrictEqual(h.runs, []);

		h.tick();
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);

		h.tick();
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id, h.id]);
	});
});

test("ingestion", (t: TestContext) => {
	t.test("is suspended for the duration of a plan", async (t: TestContext) => {
		const hold = holding();
		const h = buildHarness({ run: hold.run });

		h.unlock();
		await flush();

		t.assert.strictEqual(h.ingest.suspensions().length, 0);

		h.tick();
		await hold.entered;

		t.assert.strictEqual(h.ingest.suspensions().length, 1);

		hold.release();
		await flush();

		t.assert.strictEqual(h.ingest.suspensions().length, 0);
	});

	t.test("is resumed when a unit throws", async (t: TestContext) => {
		t.mock.method(console, "error", () => {});

		const h = buildHarness({
			run: () => Promise.reject(new Error("unit failed")),
		});

		h.unlock();
		await flush();

		h.tick();
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);
		t.assert.strictEqual(h.ingest.suspensions().length, 0);

		// the loop survives the failure
		t.assert.strictEqual(h.scheduler.waits, 2);
	});
});

test("suspension", (t: TestContext) => {
	t.test("drains immediately while idle", async (t: TestContext) => {
		const h = buildHarness();

		h.unlock();
		await flush();

		t.assert.notStrictEqual(
			await pending(h.coordinator.drain()),
			PendingSymbol,
		);
	});

	t.test("parks until the plan finalizes", async (t: TestContext) => {
		const hold = holding();
		const h = buildHarness({ run: hold.run });

		h.unlock();
		await flush();

		h.tick();
		await hold.entered;

		const suspending = h.coordinator.suspend(
			new SuspendableHandle(Symbol("suspending")),
		);
		t.assert.strictEqual(await pending(suspending), PendingSymbol);

		hold.release();
		t.assert.notStrictEqual(await pending(suspending), PendingSymbol);
	});

	t.test("releases every concurrent suspension", async (t: TestContext) => {
		const hold = holding();
		const h = buildHarness({ run: hold.run });

		h.unlock();
		await flush();

		h.tick();
		await hold.entered;

		const first = h.coordinator.suspend(new SuspendableHandle(Symbol("first")));
		const second = h.coordinator.suspend(
			new SuspendableHandle(Symbol("second")),
		);
		const third = h.coordinator.suspend(new SuspendableHandle(Symbol("third")));

		t.assert.strictEqual(await pending(first), PendingSymbol);
		t.assert.strictEqual(await pending(second), PendingSymbol);
		t.assert.strictEqual(await pending(third), PendingSymbol);

		hold.release();

		// a single slot resolver drops everyone but the most recent caller,
		// parking them forever
		t.assert.notStrictEqual(await pending(first), PendingSymbol);
		t.assert.notStrictEqual(await pending(second), PendingSymbol);
		t.assert.notStrictEqual(await pending(third), PendingSymbol);
	});

	t.test("holds the loop at the gate", async (t: TestContext) => {
		const h = buildHarness();
		const handle = new SuspendableHandle(Symbol("holding"));

		h.unlock();
		await flush();

		await h.coordinator.suspend(handle);

		h.tick();
		await flush();

		// the slot was consumed and planned, but acting on it has to wait
		t.assert.strictEqual(h.scheduler.waits, 1);
		t.assert.deepStrictEqual(h.runs, []);
		t.assert.strictEqual(h.ingest.suspensions().length, 0);

		h.coordinator.resume(handle);
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);
	});

	t.test("beats a slot it was registered alongside", async (t: TestContext) => {
		const h = buildHarness();
		const handle = new SuspendableHandle(Symbol("racing"));

		h.unlock();
		await flush();

		// registered in the same synchronous block as the slot, so it lands before
		// the loop can resume from `wait` and reach the gate
		h.tick();
		const suspending = h.coordinator.suspend(handle);

		// nothing is acting yet, so there is nothing to drain
		t.assert.notStrictEqual(await pending(suspending), PendingSymbol);
		t.assert.deepStrictEqual(h.runs, []);

		h.coordinator.resume(handle);
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);
	});
});

test("run", (t: TestContext) => {
	t.test("suspends the coordinator and ingestion", async (t: TestContext) => {
		const hold = holding();
		const h = buildHarness({ run: hold.run });
		const handle = new SuspendableHandle(Symbol("manual"));

		const plan = h.scheduler.plan(h.id);
		if (!Scheduler.viable(plan)) {
			t.assert.fail("plan is not viable");

			return;
		}

		const statuses: string[] = [];
		const iterating = (async () => {
			for await (const status of h.coordinator.run(plan, handle)) {
				statuses.push(status.kind);
			}
		})();

		await hold.entered;

		t.assert.strictEqual(h.coordinator.suspensions().length, 1);
		t.assert.strictEqual(h.ingest.suspensions().length, 1);

		hold.release();
		await iterating;

		t.assert.deepStrictEqual(statuses, ["pending", "success"]);
		t.assert.strictEqual(h.coordinator.resumed, true);
		t.assert.strictEqual(h.ingest.suspensions().length, 0);
	});

	t.test("does nothing until iterated", async (t: TestContext) => {
		const h = buildHarness();
		const handle = new SuspendableHandle(Symbol("manual"));

		const plan = h.scheduler.plan(h.id);
		if (!Scheduler.viable(plan)) {
			t.assert.fail("plan is not viable");

			return;
		}

		// async generator bodies are lazy, nothing runs before the first pull
		h.coordinator.run(plan, handle);
		await flush();

		t.assert.strictEqual(h.coordinator.resumed, true);
		t.assert.strictEqual(h.ingest.suspensions().length, 0);
		t.assert.deepStrictEqual(h.runs, []);
	});
});

test("shutdown", (t: TestContext) => {
	t.test("stops scheduling", async (t: TestContext) => {
		const h = buildHarness();

		h.unlock();
		await flush();

		t.assert.strictEqual(h.scheduler.waits, 1);

		await h.coordinator.onApplicationShutdown();
		await flush();

		h.tick();
		await flush();

		t.assert.strictEqual(h.scheduler.waits, 1);
		t.assert.deepStrictEqual(h.runs, []);
	});

	t.test("finishes the in-flight plan", async (t: TestContext) => {
		const hold = holding();
		const h = buildHarness({ run: hold.run });

		h.unlock();
		await flush();

		h.tick();
		await hold.entered;

		await h.coordinator.onApplicationShutdown();

		hold.release();
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);
		t.assert.strictEqual(h.ingest.suspensions().length, 0);
		t.assert.notStrictEqual(
			await pending(h.coordinator.drain()),
			PendingSymbol,
		);

		// the abort fired while acting, so the trip back around has to observe it
		// rather than lose it to a listener registered after dispatch
		h.tick();
		await flush();

		t.assert.deepStrictEqual(h.runs, [h.id]);
	});
});
