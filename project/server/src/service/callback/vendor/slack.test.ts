import { randomBytes } from "node:crypto";

import { test } from "tap";

import { Ingress } from "../../ingress";
import { Voucher } from "../../voucher";
import { CallbackVendorSlack } from "./slack";

test("genuine", (t) => {
	const voucher = new Voucher(randomBytes(64).toString());
	const ingress = new Ingress({ authority: "foo", secure: true }, voucher);

	{
		const timestamp = 1531420618;
		const signature = Buffer.from(
			"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
			"utf8",
		);

		const body = Buffer.from(
			"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
			"utf8",
		);

		const slack = new CallbackVendorSlack(
			"8f742231b10e8888abcd99yyyzzz85a5",
			ingress,
			voucher,
		);

		t.clock.enter();

		t.clock.travel(timestamp * 1000);
		t.equal(slack.genuine(timestamp, signature, body), "genuine");

		t.clock.travel(timestamp * 1000 + 10 * 1000);
		t.equal(slack.genuine(timestamp, signature, body), "not-genuine-timestamp");

		t.clock.travel(timestamp * 1000 - 10 * 1000);
		t.equal(slack.genuine(timestamp, signature, body), "not-genuine-timestamp");

		t.clock.exit();
	}

	{
		const timestamp = 1531420618;
		const signature = Buffer.from(
			"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
			"utf8",
		);

		const body = Buffer.from(
			"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
			"utf8",
		);

		const slack = new CallbackVendorSlack(
			"9f742231b10e8888abcd99yyyzzz85a5",
			ingress,
			voucher,
		);

		t.clock.enter();

		t.clock.travel(timestamp * 1000);
		t.equal(slack.genuine(timestamp, signature, body), "not-genuine-signature");

		t.clock.exit();
	}
	t.end();
});

test("command handling", async (t) => {
	const voucher = new Voucher("dd934b01b7bbe1ff59aaa892a6021115");
	const ingress = new Ingress({ authority: "foo", secure: true }, voucher);

	const slack = new CallbackVendorSlack(
		"8f742231b10e8888abcd99yyyzzz85a5",
		ingress,
		voucher,
	);

	t.matchSnapshot(slack.handle("/database-snapshot", ""));
	t.matchSnapshot(slack.handle("/foo", ""));
});
