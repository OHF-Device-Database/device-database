import { type TestContext, test } from "node:test";

import { cyclicNodes } from "./cyclic-dfs";

test("cyclic nodes", (t: TestContext) => {
	t.test("empty graph", (t: TestContext) => {
		t.assert.deepStrictEqual(cyclicNodes(new Map()), new Set());
	});

	t.test("no edges", (t: TestContext) => {
		const graph = new Map([
			["a", []],
			["b", []],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set());
	});

	t.test("linear chain", (t: TestContext) => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", []],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set());
	});

	t.test("direct self-reference", (t: TestContext) => {
		const graph = new Map([["a", ["a"]]]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set(["a"]));
	});

	t.test("two-node cycle", (t: TestContext) => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["a"]],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set(["a", "b"]));
	});

	t.test("three-node cycle", (t: TestContext) => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", ["a"]],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set(["a", "b", "c"]));
	});

	t.test("cycle with acyclic tail", (t: TestContext) => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", ["b"]],
		]);

		t.assert.deepStrictEqual(cyclicNodes(graph), new Set(["b", "c"]));
	});

	t.test("multiple independent cycles", (t: TestContext) => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["a"]],
			["c", ["d"]],
			["d", ["c"]],
			["e", []],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set(["a", "b", "c", "d"]));
	});

	t.test("node type: number", (t: TestContext) => {
		const graph = new Map([
			[1, [2]],
			[2, [3]],
			[3, [1]],
		]);
		t.assert.deepStrictEqual(cyclicNodes(graph), new Set([1, 2, 3]));
	});
});
