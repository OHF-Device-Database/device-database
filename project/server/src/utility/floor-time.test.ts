import { type TestContext, test } from "node:test";

import { floorTime } from "./floor-time";

test("floorTime", (t: TestContext) => {
	t.test("floors milliseconds to the nearest second", (t: TestContext) => {
		const at = new Date(1_700_000_000_500);
		t.assert.deepStrictEqual(floorTime(at), new Date(1_700_000_000_000));
	});

	t.test("leaves whole seconds unchanged", (t: TestContext) => {
		const at = new Date(1_700_000_000_000);
		t.assert.deepStrictEqual(floorTime(at), new Date(1_700_000_000_000));
	});

	t.test("floors milliseconds just below the next second", (t: TestContext) => {
		const at = new Date(1_700_000_000_999);
		t.assert.deepStrictEqual(floorTime(at), new Date(1_700_000_000_000));
	});

	t.test("uses current time when no argument is provided", (t: TestContext) => {
		t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_500 });
		t.assert.deepStrictEqual(floorTime(), new Date(1_700_000_000_000));
	});
});
