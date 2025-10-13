import { type TestContext, test } from "node:test";

import { isNone, isSome } from "./maybe";

test("some", (t: TestContext) => {
	t.assert.ok(isSome("some"));
	t.assert.ok(isSome(undefined));
	t.assert.ok(!isSome(null));
});

test("none", (t: TestContext) => {
	t.assert.ok(!isNone("some"));
	t.assert.ok(!isNone(undefined));
	t.assert.ok(isNone(null));
});
