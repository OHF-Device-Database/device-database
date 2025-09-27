import { test } from "tap";

import { coerceError } from ".";

test("coerce error", (t) => {
	t.same(coerceError("foo"), new Error("foo"));
	t.same(coerceError(new Error("foo")), new Error("foo"));
	t.same(coerceError(1), new Error("1"));

	t.end();
});
