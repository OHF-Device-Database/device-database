import { createHmac } from "node:crypto";

import { test } from "tap";

import { Voucher } from ".";

test("round-trip", (t) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	const created = voucher.create("database-snapshot");
	const serialized = voucher.serialize(created);
	const deserialized = voucher.deserialize(serialized);

	t.same(created, deserialized);

	t.end();
});

test("validate", (t) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);

	{
		const created = voucher.create("database-snapshot");

		t.clock.enter();

		const peeked = Voucher.peek(created);

		t.clock.travel(peeked.createdAt.getTime());
		t.ok(voucher.validate(created, "database-snapshot"));

		t.clock.travel(peeked.createdAt.getTime() + 9 * 1000);
		t.ok(voucher.validate(created, "database-snapshot"));

		t.clock.travel(peeked.createdAt.getTime() + -9 * 1000);
		t.ok(voucher.validate(created, "database-snapshot"));

		t.clock.travel(peeked.createdAt.getTime() + 10 * 1000);
		t.notOk(voucher.validate(created, "database-snapshot"));

		t.clock.travel(peeked.createdAt.getTime() + -10 * 1000);
		t.notOk(voucher.validate(created, "database-snapshot"));

		t.clock.exit();
	}

	{
		const created = voucher.create("no-op");
		t.notOk(
			voucher.validate(created, "database-snapshot"),
			"different purpose",
		);
	}

	t.end();
});

test("deserialize", (t) => {
	const signingKey = "87c44b8576b5801ee276d24b436a3992";

	const voucher = new Voucher(signingKey);
	const created = voucher.create("no-op");
	const serialized = voucher.serialize(created);

	t.equal(voucher.deserialize("foo"), null, "malformed voucher");

	{
		const voucher = new Voucher("424f2d675c3846e543b68071fd16f277");
		t.equal(voucher.deserialize(serialized), null, "different signing key");
	}

	{
		const buffer = Buffer.from(JSON.stringify({ purpose: "no-op" }), "utf8");

		const hmac = createHmac("sha256", signingKey);
		hmac.update(buffer);

		const serialized = `${hmac.digest("base64url")}|${buffer.toString("base64url")}`;

		t.equal(voucher.deserialize(serialized), null, "malformed data");
	}

	t.end();
});
