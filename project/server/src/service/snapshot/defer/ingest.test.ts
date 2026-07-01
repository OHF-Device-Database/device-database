import { type TestContext, test } from "node:test";

import { StubIntrospection } from "../../introspect/stub";
import { SuspendableHandle } from "../../suspendable";
import { SnapshotDeferIngest } from "./ingest";

import type { ISnapshot } from "..";
import type { ISnapshotDeferTarget } from "./base";

const buildIngest = (target: ISnapshotDeferTarget) => {
	return new SnapshotDeferIngest(
		{} as ISnapshot,
		target,
		new StubIntrospection(),
	);
};

test("suspend", async (t: TestContext) => {
	// use a deferred target that blocks on `deferred()` to control timing
	let entered: Promise<void> | undefined;
	let step: (() => void) | undefined;
	let block = true;
	let target;
	{
		const { resolve, promise: _entered } = Promise.withResolvers<void>();
		entered = _entered;

		target = {
			async deferred() {
				if (block) {
					const { resolve: _step, promise: done } =
						Promise.withResolvers<void>();
					step = _step;

					resolve();

					await done;
				}

				// produce an "idle" step
				return null;
			},
		};
	}
	const ingest = buildIngest(target as ISnapshotDeferTarget);

	const iterator = ingest.ingest()[Symbol.asyncIterator]();

	const handle = new SuspendableHandle(Symbol("foo"));

	// start first iteration, otherwise `step` is never assigned
	const n1 = iterator.next();

	// ensure that `step` has been assigned
	t.assert.notDeepStrictEqual(await Promise.race([entered, n1]), {
		done: false,
		value: "idle",
	});

	step?.();

	// first iteration done
	t.assert.deepStrictEqual(await n1, {
		done: false,
		value: "idle",
	});

	const suspending = ingest.suspend(handle);
	const n2 = iterator.next();

	t.assert.notDeepStrictEqual(await Promise.race([suspending, n2]), {
		done: false,
		value: "idle",
	});

	// disable blocking of `deferred`
	block = false;

	ingest.resume(handle);

	// second iteration done
	t.assert.deepStrictEqual(await n2, {
		done: false,
		value: "idle",
	});
});
