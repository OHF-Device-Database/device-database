import { type TestContext, test } from "node:test";

import { unroll } from "./iterable";
import { progressively } from "./progressively";

test("progressively", async (t: TestContext) => {
	{
		const unrolled = await unroll(
			progressively([
				new Promise((resolve) => setTimeout(() => resolve(1), 100)),
			]),
		);

		t.assert.deepStrictEqual(unrolled, [1], "single");
	}

	{
		const unrolled = await unroll(
			progressively([
				new Promise((resolve) => setTimeout(() => resolve(1), 100)),
				new Promise((resolve) => setTimeout(() => resolve(2), 200)),
			]),
		);

		t.assert.deepStrictEqual(unrolled, [1, 2], "multiple");
	}
});
