import { type TestContext, test } from "node:test";

import {
	abortController,
	RequestStorage,
	RequestStorageUnserializableKeyError,
	requestStorage,
} from "./request-storage";

const Domain = Symbol("Domain");

test("domain", async (t: TestContext) => {
	{
		const store = new RequestStorage();
		await requestStorage.run(store, async () => {
			const scope = store.scope(Domain);
			t.assert.strictEqual(scope.get(), undefined);
		});
	}

	{
		const store = new RequestStorage();
		await requestStorage.run(store, async () => {
			const scope = store.scope(Domain);
			scope.set("foo");
			t.assert.strictEqual(scope.get(), "foo");
		});

		await requestStorage.run(store, async () => {
			const scope = store.scope(Domain);
			t.assert.strictEqual(scope.get(), "foo");
		});
	}
});

test("domain / token", async (t: TestContext) => {
	{
		const store = new RequestStorage();
		await requestStorage.run(store, async () => {
			const scope = store.scope(RequestStorage.token(Domain)("foo"));
			t.assert.strictEqual(scope.get(), undefined);
		});
	}

	{
		const store = new RequestStorage();
		await requestStorage.run(store, async () => {
			const scope = store.scope(RequestStorage.token(Domain)("foo"));
			scope.set("foo");
			t.assert.strictEqual(scope.get(), "foo");
		});

		await requestStorage.run(store, async () => {
			const scope = store.scope(RequestStorage.token(Domain)("foo"));
			t.assert.strictEqual(scope.get(), "foo");
		});
	}
});

test("invalid token", async (t: TestContext) => {
	t.assert.throws(
		() => RequestStorage.token(Domain)(undefined),
		new RequestStorageUnserializableKeyError(undefined),
	);

	{
		const fn = () => {};

		t.assert.throws(
			() => RequestStorage.token(Domain)(fn),
			new RequestStorageUnserializableKeyError(fn),
		);
	}
});

test("token types", async (t: TestContext) => {
	t.assert.deepStrictEqual(
		RequestStorage.token(Domain)({ foo: 1, bar: 2 }),
		{
			domain: Domain,
			key: '{"bar":2,"foo":1}',
		},
		"object",
	);

	{
		const key = 1n;
		t.assert.deepStrictEqual(
			RequestStorage.token(Domain)(key),
			{
				domain: Domain,
				key,
			},
			"bigint",
		);
	}

	{
		const key = true;
		t.assert.deepStrictEqual(
			RequestStorage.token(Domain)(key),
			{
				domain: Domain,
				key,
			},
			"boolean",
		);
	}

	{
		const key = 1;
		t.assert.deepStrictEqual(
			RequestStorage.token(Domain)(key),
			{
				domain: Domain,
				key,
			},
			"number",
		);
	}

	{
		const key = "foo";
		t.assert.deepStrictEqual(
			RequestStorage.token(Domain)(key),
			{
				domain: Domain,
				key,
			},
			"string",
		);
	}

	{
		const key = Symbol("key");
		t.assert.deepStrictEqual(
			RequestStorage.token(Domain)(key),
			{
				domain: Domain,
				key,
			},
			"symbol",
		);
	}
});

test("abort controller", async (t: TestContext) => {
	const store = new RequestStorage();
	await requestStorage.run(store, async () => {
		const controller1 = abortController();
		t.assert.strictEqual(controller1?.signal.aborted, false);
		controller1?.abort();

		const controller2 = abortController();

		t.assert.strictEqual(controller2?.signal.aborted, true);
	});
});
