import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { type TestContext, test } from "node:test";

import { ArrayTransform } from "./utility";

test("array stream", async (t: TestContext) => {
	const iterable = (function* _() {
		yield 1;
		yield 2;
		yield 3;
	})();

	const readable = Readable.from(iterable);
	t.assert.deepStrictEqual(
		await text(readable.pipe(new ArrayTransform())),
		"[1,2,3]",
	);
});
