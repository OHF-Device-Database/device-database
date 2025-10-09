import { randomBytes } from "node:crypto";

import { test } from "tap";

import { CallbackVendorSlack } from "../../../../../../service/callback/vendor/slack";
import { Ingress } from "../../../../../../service/ingress";
import { Voucher } from "../../../../../../service/voucher";
import { postCallbackVendorSlackSlashCommand } from "./handler";

const voucher = new Voucher(randomBytes(64).toString());
const ingress = new Ingress({ authority: "foo", secure: true }, voucher);

test("genuine", async (t) => {
	{
		const primed = postCallbackVendorSlackSlashCommand({
			callback: {
				vendor: {
					slack: undefined,
				},
			},
		});

		const response = await primed.for.handler(
			{
				header: {
					"x-slack-request-timestamp": 0,
					"x-slack-signature":
						"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
				},
			},
			{
				command: "foo",
				text: "bar",
			},
			{
				raw: {
					requestBody: new ArrayBuffer(),
				},
			},
		);
		t.same(response, {
			code: 500,
			body: "callback not configured",
		});
	}

	const primed = postCallbackVendorSlackSlashCommand({
		callback: {
			vendor: {
				slack: new CallbackVendorSlack(
					"8f742231b10e8888abcd99yyyzzz85a5",
					ingress,
					voucher,
				),
			},
		},
	});

	{
		const timestamp = 1531420618;
		const body = Buffer.from(
			"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
			"utf8",
		);

		t.clock.enter();
		t.clock.travel(timestamp * 1000 + 10 * 1000);

		const response = await primed.for.handler(
			{
				header: {
					"x-slack-request-timestamp": timestamp,
					"x-slack-signature":
						"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
				},
			},
			{
				command: "foo",
				text: "bar",
			},
			{
				raw: {
					requestBody: body.buffer.slice(
						body.byteOffset,
						body.byteOffset + body.byteLength,
					),
				},
			},
		);
		t.same(response, {
			code: 400,
			body: "request timestamp too far out of sync",
		});

		t.clock.exit();
	}

	{
		const timestamp = 1531420618;
		const body = Buffer.from(
			"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
			"utf8",
		);

		t.clock.enter();
		t.clock.travel(timestamp * 1000);

		const response = await primed.for.handler(
			{
				header: {
					"x-slack-request-timestamp": timestamp,
					"x-slack-signature":
						"v0=b2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
				},
			},
			{
				command: "foo",
				text: "bar",
			},
			{
				raw: {
					requestBody: body.buffer.slice(
						body.byteOffset,
						body.byteOffset + body.byteLength,
					),
				},
			},
		);
		t.same(response, {
			code: 400,
			body: "request payload verification failed",
		});

		t.clock.exit();
	}

	{
		const timestamp = 1531420618;
		const body = Buffer.from(
			"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
			"utf8",
		);

		t.clock.enter();
		t.clock.travel(timestamp * 1000);

		const response = await primed.for.handler(
			{
				header: {
					"x-slack-request-timestamp": timestamp,
					"x-slack-signature":
						"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
				},
			},
			{
				command: "foo",
				text: "bar",
			},
			{
				raw: {
					requestBody: body.buffer.slice(
						body.byteOffset,
						body.byteOffset + body.byteLength,
					),
				},
			},
		);

		t.matchSnapshot(response, "successfully handled");

		t.clock.exit();
	}
});
