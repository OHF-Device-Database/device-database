import { type TestContext, test } from "node:test";

import { Schema } from "effect";

import { Voucher } from ".";

test("round-trip without managed", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const epoch = new Date();
	const epochTs = Math.floor(epoch.getTime() / 1000) * 1000;

	const created = voucher.create("foo", epoch);

	const serialized = voucher.serialize(created);
	const deserialized = voucher.deserialize(serialized, "foo", 10);
	t.assert.ok(deserialized.kind === "success");

	const peeked = Voucher.peek(deserialized.voucher);
	t.assert.deepStrictEqual(peeked, { at: new Date(epochTs), role: "foo" });
});

test("round-trip with managed", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const codec = Schema.Struct({
		bar: Schema.String,
	});

	const epoch = new Date();
	const epochTs = Math.floor(epoch.getTime() / 1000) * 1000;

	const payload = { bar: "baz" };

	const created = voucher.create("foo", epoch, payload);

	const serialized = voucher.serialize(created, codec);
	const deserialized = voucher.deserialize(serialized, "foo", 10, codec);
	t.assert.ok(deserialized.kind === "success");
	const peeked = Voucher.peek(deserialized.voucher);
	t.assert.deepStrictEqual(peeked, {
		...payload,
		role: "foo",
		at: new Date(epochTs),
	});
});

test("different role", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const codec = Schema.Struct({
		bar: Schema.String,
	});

	const payload = { bar: "baz" };

	const created = voucher.create("foo", new Date(), payload);

	const serialized = voucher.serialize(created, codec);
	const deserialized = voucher.deserialize(serialized, "bar", 10, codec);
	t.assert.partialDeepStrictEqual(deserialized, {
		kind: "error",
		cause: "role-mismatch",
	});
	t.assert.deepStrictEqual(Voucher.unwrap(deserialized as any), payload);
});

test("expired", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const codec = Schema.Struct({
		bar: Schema.String,
	});

	const payload = { bar: "baz" };

	const expected = { kind: "error", cause: "expired" };

	const now = Date.now();
	t.mock.timers.enable({ apis: ["Date"], now });

	const created = voucher.create("foo", new Date(), payload);

	{
		t.mock.timers.setTime(now + 20 * 1000);
		const serialized = voucher.serialize(created, codec);
		const deserialized = voucher.deserialize(serialized, "foo", 10, codec);
		t.assert.deepStrictEqual(Voucher.unwrap(deserialized as any), payload);
		t.assert.partialDeepStrictEqual(deserialized, expected);
	}

	{
		t.mock.timers.setTime(now - 20 * 1000);
		const serialized = voucher.serialize(created, codec);
		const deserialized = voucher.deserialize(serialized, "foo", 10, codec);
		t.assert.deepStrictEqual(Voucher.unwrap(deserialized as any), payload);
		t.assert.partialDeepStrictEqual(deserialized, expected);
	}
});

test("malformed encoded", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const codec = Schema.Struct({
		bar: Schema.String,
	});

	const payload = { bar: "baz" };

	const created = voucher.create("foo", new Date(), payload);

	let serialized = voucher.serialize(created, codec);
	serialized = `+${serialized.slice(1, -1)}`;
	const deserialized = voucher.deserialize(serialized, "foo", 10, codec);

	t.assert.deepStrictEqual(deserialized, {
		kind: "error",
		cause: "malformed",
	});
});
