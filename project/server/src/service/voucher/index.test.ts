import { createHmac } from "node:crypto";
import { type TestContext, test } from "node:test";

import { Voucher } from ".";

test("round-trip", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const created = voucher.create("database-snapshot");
	const serialized = voucher.serialize(created);
	const deserialized = voucher.deserialize(serialized);

	t.assert.deepStrictEqual(created, deserialized);
});

test("validate", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	{
		const created = voucher.create("database-snapshot");

		t.mock.timers.enable({ apis: ["Date"] });

		const peeked = Voucher.peek(created);

		t.mock.timers.setTime(peeked.createdAt.getTime());
		t.assert.ok(voucher.validate(created, "database-snapshot"));

		t.mock.timers.setTime(peeked.createdAt.getTime() + 9 * 1000);
		t.assert.ok(voucher.validate(created, "database-snapshot"));

		t.mock.timers.setTime(peeked.createdAt.getTime() + -9 * 1000);
		t.assert.ok(voucher.validate(created, "database-snapshot"));

		t.mock.timers.setTime(peeked.createdAt.getTime() + 10 * 1000);
		t.assert.ok(!voucher.validate(created, "database-snapshot"));

		t.mock.timers.setTime(peeked.createdAt.getTime() + -10 * 1000);
		t.assert.ok(!voucher.validate(created, "database-snapshot"));
	}

	{
		const created = voucher.create("no-op");
		t.assert.ok(
			!voucher.validate(created, "database-snapshot"),
			"different purpose",
		);
	}
});

test("deserialize", (t: TestContext) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);
	const created = voucher.create("no-op");
	const serialized = voucher.serialize(created);

	t.assert.strictEqual(voucher.deserialize("foo"), null, "malformed voucher");

	{
		const voucher = new Voucher("424f2d675c3846e543b68071fd16f277");
		t.assert.strictEqual(
			voucher.deserialize(serialized),
			null,
			"different signing key",
		);
	}

	{
		const buffer = Buffer.from(JSON.stringify({ purpose: "no-op" }), "utf8");

		const hmac = createHmac("sha256", signingKey);
		hmac.update(buffer);

		const serialized = `${hmac.digest("base64url")}|${buffer.toString("base64url")}`;

		t.assert.strictEqual(
			voucher.deserialize(serialized),
			null,
			"malformed data",
		);
	}
});
