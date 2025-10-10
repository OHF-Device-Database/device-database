import { type TestContext, test } from "node:test";

import { coerceError } from ".";

test("coerce error", (t: TestContext) => {
	t.assert.deepStrictEqual(coerceError("foo"), new Error("foo"));
	t.assert.deepStrictEqual(coerceError(new Error("foo")), new Error("foo"));
	t.assert.deepStrictEqual(coerceError(1), new Error("1"));
});
