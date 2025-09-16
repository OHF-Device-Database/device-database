import { test } from "tap";

import { isNone, isSome } from "./maybe";

test("some", (t) => {
	t.ok(isSome("some"));
	t.ok(isSome(undefined));
	t.notOk(isSome(null));

	t.end();
});

test("none", (t) => {
	t.notOk(isNone("some"));
	t.notOk(isNone(undefined));
	t.ok(isNone(null));

	t.end();
});
