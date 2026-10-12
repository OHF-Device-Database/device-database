import { type TestContext, test } from "node:test";

import { logger } from "../../../logger";
import { StubIntrospection } from "../../introspect/stub";
import { SuspendableHandle } from "../../suspendable";
import { Voucher } from "../../voucher";
import { SnapshotDeferIngest } from "./ingest";

import type { Uuid } from "../../../type/codec/uuid";
import type { ISnapshot, SnapshotHash } from "..";
import type { SnapshotRequestTransformOut } from "../stream";
import type { ISnapshotDeferTarget, SnapshotDeferTargetDeferred } from "./base";

logger.silent = true;

const buildIngest = (target: ISnapshotDeferTarget, snapshot?: ISnapshot) => {
	return new SnapshotDeferIngest(
		snapshot ?? ({} as ISnapshot),
		target,
		new StubIntrospection(),
	);
};

const id = "00000000-0000-4000-8000-000000000000" as Uuid;
const sub = "00000000-0000-4000-8000-000000000001" as Uuid;

/** a tripwire iterable, consumption means the handle is held for longer than the test assumes */
const nonconsumable = (): AsyncIterable<SnapshotRequestTransformOut> => ({
	[Symbol.asyncIterator]: () => ({
		next: () =>
			Promise.reject(new Error("snapshot must not be consumed in this test")),
	}),
});

/** an iterable that never delivers, mirroring an s3 object the client keeps open forever */
const undeliverable = (): AsyncIterable<SnapshotRequestTransformOut> => ({
	[Symbol.asyncIterator]: () => ({
		next: () => new Promise<never>(() => {}),
	}),
});

/** forges handle */
const buildHandle = () =>
	new Proxy({}, { get: () => ({ kind: "attachable-hashed" }) });

/** a deferred snapshot that records whether it was disposed */
const buildDeferred = (
	snapshot: AsyncIterable<SnapshotRequestTransformOut> = nonconsumable(),
) => {
	const state = { disposed: 0 };

	const deferred: SnapshotDeferTargetDeferred = {
		voucher: new Voucher("signing-key").create(
			"snapshot-submission",
			new Date(0),
			{ id, sub },
		),
		hassVersion: "2024.1.0",
		hash: {} as SnapshotHash,
		createdAt: new Date(0),
		snapshot,
		[Symbol.asyncDispose]: async () => {
			state.disposed += 1;
		},
	};

	return { deferred, state };
};

/** a target handing out `deferred` exactly once, recording terminal calls */
const buildTarget = (deferred: SnapshotDeferTargetDeferred) => {
	const state = { completed: [] as Uuid[], archived: [] as Uuid[] };

	let handed = false;
	const target = {
		async deferred() {
			if (handed) {
				return null;
			}
			handed = true;

			return deferred;
		},
		async complete(completed: Uuid) {
			state.completed.push(completed);
		},
		async archive(archived: Uuid) {
			state.archived.push(archived);
		},
	} as ISnapshotDeferTarget;

	return { target, state };
};

/** snapshot service handing out an attachable handle */
const buildSnapshot = () => {
	const state = {
		attached: [] as string[],
		finalized: [] as string[],
		deleted: [] as Uuid[],
	};

	const snapshot = {
		voucher: {
			expiresAt: () => new Date(0),
		},
		create: async () => ({ kind: "success", handle: buildHandle() }),
		finalize: async (_handle: unknown, hassVersion: string) => {
			state.finalized.push(hassVersion);
		},
		delete: async (deleted: Uuid) => {
			state.deleted.push(deleted);
		},
		attach: {
			device: async (_handle: unknown, integration: string) => {
				state.attached.push(`device:${integration}`);
			},
			entity: async (_handle: unknown, integration: string) => {
				state.attached.push(`entity:${integration}`);
			},
		},
	} as unknown as ISnapshot;

	return { snapshot, state };
};

const device = {
	integration: "hue",
	device: {},
	entities: [],
} as unknown as SnapshotRequestTransformOut;
const entity = {
	integration: "mqtt",
	entity: {},
} as unknown as SnapshotRequestTransformOut;

/** drains the microtask queue, letting the ingest loop reach its next real suspension point */
const settled = () => new Promise((resolve) => setImmediate(resolve));

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

test("release", async (t: TestContext) => {
	await t.test("unconsumed", async (t: TestContext) => {
		const { deferred, state } = buildDeferred();
		const { target, state: calls } = buildTarget(deferred);

		const snapshot = {
			voucher: {
				expiresAt: () => new Date(0),
			},
			// handle acquisition fails, so `snapshot` is never iterated
			create: async () => ({ kind: "failure", reason: "voucher-used" }),
		} as unknown as ISnapshot;

		const iterator = buildIngest(target, snapshot)
			.ingest()
			[Symbol.asyncIterator]();

		t.assert.deepStrictEqual(await iterator.next(), {
			done: false,
			value: "acted",
		});

		// handle must be released before the step is handed to the consumer
		t.assert.strictEqual(state.disposed, 1);
		t.assert.deepStrictEqual(calls.completed, [id]);
	});

	await t.test("failed ingestion", async (t: TestContext) => {
		const { deferred, state } = buildDeferred();
		const { target } = buildTarget(deferred);

		const snapshot = {
			voucher: {
				expiresAt: () => new Date(0),
			},
			create: async () => {
				throw new Error("error");
			},
		} as unknown as ISnapshot;

		const iterator = buildIngest(target, snapshot)
			.ingest()
			[Symbol.asyncIterator]();

		await t.assert.rejects(iterator.next(), /error/);

		t.assert.strictEqual(state.disposed, 1);
	});
});

test("consume", async (t: TestContext) => {
	await t.test("attaches every item", async (t: TestContext) => {
		const { deferred, state } = buildDeferred(
			(async function* () {
				yield device;
				yield entity;
			})(),
		);
		const { target, state: calls } = buildTarget(deferred);
		const { snapshot, state: recorded } = buildSnapshot();

		const iterator = buildIngest(target, snapshot)
			.ingest()
			[Symbol.asyncIterator]();

		t.assert.deepStrictEqual(await iterator.next(), {
			done: false,
			value: "acted",
		});

		t.assert.deepStrictEqual(recorded.attached, ["device:hue", "entity:mqtt"]);
		t.assert.deepStrictEqual(recorded.finalized, ["2024.1.0"]);
		t.assert.deepStrictEqual(recorded.deleted, []);
		t.assert.deepStrictEqual(calls.completed, [id]);
		t.assert.strictEqual(state.disposed, 1);
	});

	await t.test(
		"gives up on stream that never delivers",
		async (t: TestContext) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });

			const { deferred, state } = buildDeferred(undeliverable());
			const { target, state: calls } = buildTarget(deferred);
			const { snapshot, state: recorded } = buildSnapshot();

			const iterator = buildIngest(target, snapshot)
				.ingest()
				[Symbol.asyncIterator]();

			const step = iterator.next();

			await settled();
			t.mock.timers.tick(30_000);

			t.assert.deepStrictEqual(await step, { done: false, value: "acted" });

			t.assert.deepStrictEqual(calls.completed, [id]);
			t.assert.deepStrictEqual(calls.archived, []);
			t.assert.deepStrictEqual(recorded.finalized, []);
			t.assert.deepStrictEqual(recorded.deleted, [id]);
			t.assert.strictEqual(state.disposed, 1);
		},
	);

	await t.test(
		"drops deadline once a chunk arrives",
		async (t: TestContext) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });

			let release: (() => void) | undefined;
			const { deferred } = buildDeferred(
				(async function* () {
					yield entity;
					await new Promise<void>((resolve) => {
						release = resolve;
					});
					yield device;
				})(),
			);
			const { target, state: calls } = buildTarget(deferred);
			const { snapshot, state: recorded } = buildSnapshot();

			const iterator = buildIngest(target, snapshot)
				.ingest()
				[Symbol.asyncIterator]();

			const step = iterator.next();

			await settled();
			t.assert.deepStrictEqual(recorded.attached, ["entity:mqtt"]);

			// beyond the deadline
			t.mock.timers.tick(30_000 * 10);
			await settled();

			t.assert.deepStrictEqual(calls.completed, []);
			t.assert.deepStrictEqual(recorded.deleted, []);

			release?.();

			t.assert.deepStrictEqual(await step, { done: false, value: "acted" });
			t.assert.deepStrictEqual(recorded.attached, [
				"entity:mqtt",
				"device:hue",
			]);
			t.assert.deepStrictEqual(recorded.finalized, ["2024.1.0"]);
			t.assert.deepStrictEqual(calls.completed, [id]);
		},
	);
});
