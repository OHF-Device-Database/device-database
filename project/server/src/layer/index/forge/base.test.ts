import { type TestContext, test } from "node:test";

import { memoize } from "./base";

import type { IndexForge } from "./base";

test("index forge", async (t: TestContext) => {
	await t.test("memoizes blobs", async (t: TestContext) => {
		const calls: string[] = [];
		const forge: IndexForge = {
			head: async () => "h",
			async *ancestry() {},
			tree: async (hash) => {
				calls.push(`tree ${hash}`);
				return [];
			},
			blob: async (hash) => {
				calls.push(`blob ${hash}`);
				return Buffer.from(hash);
			},
		};
		const memoized = memoize(forge);

		const [a, b] = await Promise.all([memoized.blob("x"), memoized.blob("x")]);
		await memoized.blob("y");
		await memoized.tree("t");
		await memoized.tree("t");

		t.assert.strictEqual(a, b);
		t.assert.strictEqual(await memoized.head(), "h");
		t.assert.deepStrictEqual(calls, ["blob x", "blob y", "tree t", "tree t"]);
	});
});
