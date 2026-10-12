import { Duplex, Readable } from "node:stream";
import { type TestContext, test } from "node:test";

import { logger } from "../../../logger";
import { bridgeFailure } from "./object-store";

logger.silent = true;

/** models how the sdk layers `ChecksumStream` on top of a response: a duplex fed by `source.pipe(this)` */
class PipeLinkedWrapper extends Duplex {
	constructor(readonly source: Readable) {
		super();

		this.source.pipe(this);
	}

	override _read(): void {}

	override _write(
		chunk: unknown,
		_: BufferEncoding,
		callback: (err?: Error) => void,
	): void {
		this.push(chunk);

		callback();
	}
}

/** a response that is still open, mirroring one whose advertised `content-length` has not been reached */
const buildResponse = () => {
	const source = new Readable({ read() {} });
	source.push(Buffer.from("partial"));

	return source;
};

/** records how a wrapper settles, if it settles at all */
const watch = (wrapper: Readable) => {
	const state = { error: undefined as string | undefined, ended: false };

	wrapper.once("error", (err: Error) => {
		state.error = err.message;
	});
	wrapper.once("end", () => {
		state.ended = true;
	});
	wrapper.resume();

	return state;
};

/** lets stream events reach their listeners */
const settled = async () => {
	for (let i = 0; i < 4; i += 1) {
		await new Promise((resolve) => setImmediate(resolve));
	}
};

test("bridgeFailure", async (t: TestContext) => {
	await t.test(
		"a pipe linked wrapper is deaf to the failure of its source",
		async (t: TestContext) => {
			const source = buildResponse();
			const wrapper = new PipeLinkedWrapper(source);
			const state = watch(wrapper);

			// the sdk's own handler, without which the failure would go uncaught instead of unnoticed
			source.once("error", () => {});

			source.destroy(new Error("ECONNRESET"));
			await settled();

			// the premise of the bridge: the wrapper neither fails nor ends, so a reader of it waits forever
			t.assert.strictEqual(state.error, undefined);
			t.assert.strictEqual(state.ended, false);
			t.assert.strictEqual(wrapper.destroyed, false);
		},
	);

	await t.test(
		"carries the failure across the link",
		async (t: TestContext) => {
			const source = buildResponse();
			const wrapper = new PipeLinkedWrapper(source);
			const state = watch(wrapper);

			bridgeFailure(wrapper);

			source.destroy(new Error("ECONNRESET"));
			await settled();

			t.assert.strictEqual(state.error, "ECONNRESET");
		},
	);

	await t.test("leaves an unwrapped response alone", async (t: TestContext) => {
		const source = buildResponse();
		const state = watch(source);

		bridgeFailure(source);

		source.destroy(new Error("ECONNRESET"));
		await settled();

		// errors already reach a reader of the response itself, and the bridge must not swallow them
		t.assert.strictEqual(state.error, "ECONNRESET");
	});

	await t.test("ignores a body that is not a stream", (t: TestContext) => {
		t.assert.doesNotThrow(() => {
			bridgeFailure(undefined);
			bridgeFailure({ source: "not a stream" });
		});
	});
});
