import { getEventListeners } from "node:events";
import { type TestContext, test } from "node:test";

import { AbortedSymbol, aborted } from "./aborted";
import race from "./race-as-promised";

const PendingSymbol = Symbol("Pending");
type PendingSymbol = typeof PendingSymbol;

/** resolves to {@link PendingSymbol} unless `promise` settles first */
const pending = <T>(promise: Promise<T>): Promise<T | PendingSymbol> =>
	Promise.race([
		promise,
		new Promise<PendingSymbol>((resolve) =>
			setTimeout(() => resolve(PendingSymbol), 0),
		),
	]);

const listeners = (signal: AbortSignal): number =>
	getEventListeners(signal, "abort").length;

test("aborted", (t: TestContext) => {
	t.test("stays pending while the signal is live", async (t: TestContext) => {
		const controller = new AbortController();

		t.assert.strictEqual(
			await pending(aborted(controller.signal)),
			PendingSymbol,
		);
	});

	t.test("resolves once the signal aborts", async (t: TestContext) => {
		const controller = new AbortController();

		const done = aborted(controller.signal);
		controller.abort();

		t.assert.strictEqual(await done, AbortedSymbol);
	});

	t.test(
		"resolves for a signal that already aborted",
		async (t: TestContext) => {
			const controller = new AbortController();
			controller.abort();

			// a listener registered after dispatch never fires, so this has to be
			// short circuited — otherwise the abort is silently lost
			t.assert.strictEqual(
				await pending(aborted(controller.signal)),
				AbortedSymbol,
			);
		},
	);

	t.test("resolves for a signal aborted in between", async (t: TestContext) => {
		const controller = new AbortController();

		t.assert.strictEqual(
			await pending(aborted(controller.signal)),
			PendingSymbol,
		);
		controller.abort();

		t.assert.strictEqual(
			await pending(aborted(controller.signal)),
			AbortedSymbol,
		);
	});
});

test("aborted memoization", (t: TestContext) => {
	t.test("returns the same promise for a signal", (t: TestContext) => {
		const controller = new AbortController();

		// identity matters — wrapping in a fresh promise (by declaring `aborted` `async`, say) leaks a reaction per call
		t.assert.strictEqual(
			aborted(controller.signal),
			aborted(controller.signal),
		);
	});

	t.test(
		"returns the same promise for an already aborted signal",
		(t: TestContext) => {
			const controller = new AbortController();
			controller.abort();

			t.assert.strictEqual(
				aborted(controller.signal),
				aborted(controller.signal),
			);
		},
	);

	t.test("returns distinct promises per signal", (t: TestContext) => {
		const a = new AbortController();
		const b = new AbortController();

		t.assert.notStrictEqual(aborted(a.signal), aborted(b.signal));
	});

	t.test("resolves every observer of a signal", async (t: TestContext) => {
		const controller = new AbortController();

		const observers = Array.from({ length: 8 }, () =>
			aborted(controller.signal),
		);
		controller.abort();

		t.assert.deepStrictEqual(
			await Promise.all(observers),
			observers.map(() => AbortedSymbol),
		);
	});
});

test("aborted listeners", (t: TestContext) => {
	t.test("registers a single listener per signal", (t: TestContext) => {
		const controller = new AbortController();
		t.assert.strictEqual(listeners(controller.signal), 0);

		for (let i = 0; i < 16; i++) {
			aborted(controller.signal);
		}

		t.assert.strictEqual(listeners(controller.signal), 1);
	});

	t.test(
		"registers no listener for an already aborted signal",
		(t: TestContext) => {
			const controller = new AbortController();
			controller.abort();

			for (let i = 0; i < 16; i++) {
				aborted(controller.signal);
			}

			t.assert.strictEqual(listeners(controller.signal), 0);
		},
	);

	t.test(
		"does not accumulate listeners when raced repeatedly",
		async (t: TestContext) => {
			// mirrors the scheduler coordinator loop, which races the shutdown
			// signal against the next scheduled slot on every iteration
			const controller = new AbortController();

			for (let i = 0; i < 16; i++) {
				const raced = await race([
					Promise.resolve(i),
					aborted(controller.signal),
				]);

				t.assert.strictEqual(raced, i);
			}

			t.assert.strictEqual(listeners(controller.signal), 1);

			controller.abort();

			t.assert.strictEqual(
				await race([new Promise<never>(() => {}), aborted(controller.signal)]),
				AbortedSymbol,
			);
		},
	);
});
