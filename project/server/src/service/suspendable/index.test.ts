import { type TestContext, test } from "node:test";

import { Suspendable, SuspendableHandle } from ".";

class TestSuspendable extends Suspendable {
	drained = 0;

	async drain() {
		this.drained++;
	}
}

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
});
