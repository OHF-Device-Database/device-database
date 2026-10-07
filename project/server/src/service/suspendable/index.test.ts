import { type TestContext, test } from "node:test";

import race from "../../utility/race-as-promised";
import { Suspendable, SuspendableHandle } from ".";

class TestSuspendable extends Suspendable {
	drained = 0;

	async drain() {
		this.drained++;
	}
}

/** mirrors how the real suspendable gate `drain` on an in-flight operation */
class ParkingSuspendable extends Suspendable {
	acting = false;

	override drain(): Promise<void> {
		return this.park(this.acting);
	}

	/** finalizes the in-flight operation */
	finalize() {
		this.acting = false;
		this.settle();
	}

	/** settles without an operation having been in-flight */
	release() {
		this.settle();
	}
}

class GatedSuspendable extends Suspendable {
	acting = false;

	override drain(): Promise<void> {
		return this.park(this.acting);
	}

	/** checks once, as `await this.suspended()` on its own would */
	async unguarded() {
		await this.suspended();
		this.acting = true;
	}

	/** re-checks after the await, so the check and the write share a block */
	async guarded() {
		while (!this.resumed) {
			await this.suspended();
		}
		this.acting = true;
	}

	finalize() {
		this.acting = false;
		this.settle();
	}
}

/** registers a suspension from a microtask
 *
 * semantically what a caller resuming from an await while the gate sits between its check and its write would do */
const racing = (s: GatedSuspendable, handle: SuspendableHandle) =>
	(async () => {
		await null;
		await s.suspend(handle);
	})();

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

test("suspend", (t: TestContext) => {
	t.test("performs drain", async (t: TestContext) => {
		const s = new TestSuspendable();
		const handle = new SuspendableHandle(Symbol("test"));

		await s.suspend(handle);

		t.assert.strictEqual(s.drained, 1);
	});

	t.test("duplicate suspend is no-op", async (t: TestContext) => {
		const s = new TestSuspendable();
		const sym = Symbol("test");
		const handle = new SuspendableHandle(sym);

		await s.suspend(handle);
		await s.suspend(handle);

		const result = s.resume(handle);
		t.assert.strictEqual(result.inert, false);
		t.assert.strictEqual(result.remaining.length, 0);

		t.assert.strictEqual(s.drained, 1);
	});
});

test("resume", (t: TestContext) => {
	t.test("returns inert when nothing was suspended", (t: TestContext) => {
		const s = new TestSuspendable();

		const handle = new SuspendableHandle(Symbol("test"));
		const result = s.resume(handle);

		t.assert.strictEqual(result.inert, true);
		t.assert.deepStrictEqual(result.remaining, []);
	});

	t.test("resumes a suspended handle", async (t: TestContext) => {
		const s = new TestSuspendable();

		const handle = new SuspendableHandle(Symbol("test"));
		await s.suspend(handle);

		const result = s.resume(handle);
		t.assert.strictEqual(result.inert, false);
		t.assert.deepStrictEqual(result.remaining, []);
	});

	t.test(
		"resuming the same handle twice is inert the second time",
		async (t: TestContext) => {
			const s = new TestSuspendable();

			const handle = new SuspendableHandle(Symbol("test"));
			await s.suspend(handle);

			const first = s.resume(handle);
			t.assert.strictEqual(first.inert, false);

			const second = s.resume(handle);
			t.assert.strictEqual(second.inert, true);
		},
	);

	t.test(
		"remaining reflects other active suspensions",
		async (t: TestContext) => {
			const s = new TestSuspendable();
			const symbolA = Symbol("a");
			const h1 = new SuspendableHandle(symbolA, "t1");
			const h2 = new SuspendableHandle(symbolA, "t2");
			const h3 = new SuspendableHandle(Symbol("b"));

			await s.suspend(h1);
			await s.suspend(h2);
			await s.suspend(h3);

			const result = s.resume(h1);

			t.assert.strictEqual(result.inert, false);
			t.assert.deepStrictEqual(result.remaining, [
				{
					description: "a",
					tag: "t2",
				},
				{
					description: "b",
					tag: undefined,
				},
			]);
		},
	);
});

test("resumed", (t: TestContext) => {
	t.test("not suspended", (t: TestContext) => {
		const s = new TestSuspendable();

		t.assert.strictEqual(s.resumed, true);
	});

	t.test("suspended", async (t: TestContext) => {
		const s = new TestSuspendable();
		const handle = new SuspendableHandle(Symbol("test"));

		await s.suspend(handle);

		t.assert.strictEqual(s.resumed, false);
	});

	t.test("suspended and resumed", async (t: TestContext) => {
		const s = new TestSuspendable();
		const handle = new SuspendableHandle(Symbol("test"));

		await s.suspend(handle);
		s.resume(handle);

		t.assert.strictEqual(s.resumed, true);
	});

	t.test("multiple suspensions", async (t: TestContext) => {
		const s = new TestSuspendable();
		const symbol = Symbol("a");
		const h1 = new SuspendableHandle(symbol, "t1");
		const h2 = new SuspendableHandle(symbol, "t2");

		await s.suspend(h1);
		await s.suspend(h2);

		s.resume(h1);
		t.assert.strictEqual(s.resumed, false);

		s.resume(h2);
		t.assert.strictEqual(s.resumed, true);
	});

	t.test("successive resuming", async (t: TestContext) => {
		const s = new TestSuspendable();
		const h1 = new SuspendableHandle(Symbol("a"));
		const h2 = new SuspendableHandle(Symbol("b"));

		await s.suspend(h1);
		await s.suspend(h2);

		s.resume(h1);
		t.assert.strictEqual(s.resumed, false);

		s.resume(h2);
		t.assert.strictEqual(s.resumed, true);
	});
});

test("suspended", (t: TestContext) => {
	t.test(
		"resolves immediately when nothing is suspended",
		async (t: TestContext) => {
			const s = new TestSuspendable();

			const sentinel = Symbol();

			t.assert.notStrictEqual(
				await Promise.race([s.suspended(), sentinel]),
				sentinel,
			);
		},
	);

	t.test("waits for all suspensions to be resumed", async (t: TestContext) => {
		const s = new TestSuspendable();
		const h1 = new SuspendableHandle(Symbol("a"));
		const h2 = new SuspendableHandle(Symbol("b"));

		const sentinel = Symbol();

		await s.suspend(h1);
		t.assert.strictEqual(
			await Promise.race([s.suspended(), sentinel]),
			sentinel,
		);

		await s.suspend(h2);
		t.assert.strictEqual(
			await Promise.race([s.suspended(), sentinel]),
			sentinel,
		);

		{
			const resumed = s.resume(h2);
			t.assert.deepEqual(resumed.inert, false);
			t.assert.deepStrictEqual(resumed.remaining, [
				{ description: "a", tag: undefined },
			]);
		}

		t.assert.strictEqual(
			await Promise.race([s.suspended(), sentinel]),
			sentinel,
		);

		{
			const resumed = s.resume(h1);
			t.assert.deepEqual(resumed.inert, false);
			t.assert.deepStrictEqual(resumed.remaining, []);
		}

		t.assert.notStrictEqual(
			await Promise.race([s.suspended(), sentinel]),
			sentinel,
		);
	});

	t.test(
		"suspensions that are registered while already parked are handled",
		async (t: TestContext) => {
			const s = new TestSuspendable();
			const h1 = new SuspendableHandle(Symbol("a"));
			const h2 = new SuspendableHandle(Symbol("b"));

			const sentinel = Symbol();

			await s.suspend(h1);

			const parked = s.suspended();

			await s.suspend(h2);
			s.resume(h1);

			t.assert.strictEqual(await Promise.race([parked, sentinel]), sentinel);

			s.resume(h2);
			await parked;
		},
	);
});

test("drain", (t: TestContext) => {
	t.test(
		"resolves immediately when nothing is in-flight",
		async (t: TestContext) => {
			const s = new ParkingSuspendable();

			t.assert.notStrictEqual(await pending(s.drain()), PendingSymbol);
		},
	);

	t.test("parks while an operation is in-flight", async (t: TestContext) => {
		const s = new ParkingSuspendable();
		s.acting = true;

		const drained = s.drain();
		t.assert.strictEqual(await pending(drained), PendingSymbol);

		s.finalize();
		t.assert.notStrictEqual(await pending(drained), PendingSymbol);
	});

	t.test("releases every parked caller", async (t: TestContext) => {
		const s = new ParkingSuspendable();
		s.acting = true;

		const first = s.drain();
		const second = s.drain();
		const third = s.drain();

		t.assert.strictEqual(await pending(first), PendingSymbol);
		t.assert.strictEqual(await pending(second), PendingSymbol);
		t.assert.strictEqual(await pending(third), PendingSymbol);

		s.finalize();

		// a single slot resolver drops everyone but the most recent caller,
		// parking them forever
		t.assert.notStrictEqual(await pending(first), PendingSymbol);
		t.assert.notStrictEqual(await pending(second), PendingSymbol);
		t.assert.notStrictEqual(await pending(third), PendingSymbol);
	});

	t.test("parks the next generation separately", async (t: TestContext) => {
		const s = new ParkingSuspendable();

		s.acting = true;
		const first = s.drain();
		s.finalize();
		t.assert.notStrictEqual(await pending(first), PendingSymbol);

		// must not observe the settled promise of the previous generation
		s.acting = true;
		const second = s.drain();
		t.assert.strictEqual(await pending(second), PendingSymbol);

		s.finalize();
		t.assert.notStrictEqual(await pending(second), PendingSymbol);
	});

	t.test("settling without parked callers is inert", async (t: TestContext) => {
		const s = new ParkingSuspendable();

		s.release();
		s.release();

		s.acting = true;
		const drained = s.drain();
		t.assert.strictEqual(await pending(drained), PendingSymbol);

		s.finalize();
		t.assert.notStrictEqual(await pending(drained), PendingSymbol);
	});

	t.test(
		"concurrent suspends all resolve once finalized",
		async (t: TestContext) => {
			const s = new ParkingSuspendable();
			s.acting = true;

			const a = s.suspend(new SuspendableHandle(Symbol("a")));
			const b = s.suspend(new SuspendableHandle(Symbol("b")));

			t.assert.strictEqual(await pending(a), PendingSymbol);
			t.assert.strictEqual(await pending(b), PendingSymbol);

			s.finalize();

			t.assert.notStrictEqual(await pending(a), PendingSymbol);
			t.assert.notStrictEqual(await pending(b), PendingSymbol);

			t.assert.strictEqual(s.suspensions().length, 2);
		},
	);
});

test("gate", (t: TestContext) => {
	t.test("parks a suspension racing the gate", async (t: TestContext) => {
		const s = new GatedSuspendable();
		const handle = new SuspendableHandle(Symbol("racing"));

		const suspending = racing(s, handle);

		// nothing is suspended, so the loop never awaits and `acting` is written in the same synchronous block as the check
		await s.guarded();
		t.assert.strictEqual(s.acting, true);
		t.assert.strictEqual(s.suspensions().length, 1);

		// the suspension lost, so it has to wait the operation out
		t.assert.strictEqual(await pending(suspending), PendingSymbol);

		s.finalize();
		t.assert.notStrictEqual(await pending(suspending), PendingSymbol);
	});

	t.test(
		"re-parks on a suspension registered while parked",
		async (t: TestContext) => {
			const s = new GatedSuspendable();
			const first = new SuspendableHandle(Symbol("first"));
			const second = new SuspendableHandle(Symbol("second"));

			await s.suspend(first);

			const entered = s.guarded();
			t.assert.strictEqual(await pending(entered), PendingSymbol);

			// released and re-suspended before the gate can resume
			s.resume(first);
			const suspending = racing(s, second);

			// the re-check has to catch `second`, rather than acting on the emptiness `suspended()` observed before yielding
			t.assert.strictEqual(await pending(entered), PendingSymbol);
			t.assert.strictEqual(s.acting, false);
			t.assert.notStrictEqual(await pending(suspending), PendingSymbol);

			s.resume(second);
			await entered;
			t.assert.strictEqual(s.acting, true);
		},
	);

	t.test("checking once leaves the window open", async (t: TestContext) => {
		const s = new GatedSuspendable();
		const handle = new SuspendableHandle(Symbol("racing"));

		const suspending = racing(s, handle);

		// `await` yields a microtask even though `suspended()` returned synchronously, so the suspension registers before acting flag is written
		await s.unguarded();

		// drain read acting flag while it was still false, so the caller is told nothing is running when it is
		t.assert.notStrictEqual(await pending(suspending), PendingSymbol);
	});
});
