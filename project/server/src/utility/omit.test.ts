import { type TestContext, test } from "node:test";

import { omit } from "./omit";

test("omit", (t: TestContext) => {
	const from = { a: 10, b: 20, c: 30 };
	const { a: _, b, c } = from;
	t.assert.deepStrictEqual(omit(from, "a"), { b, c });
});
