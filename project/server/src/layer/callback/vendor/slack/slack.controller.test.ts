import { parse } from "node:querystring";
import { type TestContext, test } from "node:test";

import { InternalServerErrorException } from "@nestjs/common";

import { CallbackVendorSlack } from "../../../../service/callback/vendor/slack";
import { invoke } from "../../../test";
import { ControllerCallbackVendorSlack } from "./slack.controller";

import type { ISnapshotDeferIngest } from "../../../../service/snapshot/defer/ingest";
import type { RequestStub } from "../../../test";

const post = (
	controller: ControllerCallbackVendorSlack,
	request: RequestStub,
): unknown => invoke(controller, "post", request);

// https://docs.slack.dev/authentication/verifying-requests-from-slack
const SIGNING_KEY = "8f742231b10e8888abcd99yyyzzz85a5";
const TIMESTAMP = 1531420618;
const SIGNATURE =
	"v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503";
const PAYLOAD = Buffer.from(
	"token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
	"utf8",
);

const request = (
	signature: string = SIGNATURE,
	timestamp: number = TIMESTAMP,
): RequestStub => ({
	headers: {
		"x-slack-signature": signature,
		"x-slack-request-timestamp": String(timestamp),
	},
	// the platform's parser leaves the decoded form behind, the raw payload is retained alongside
	body: parse(PAYLOAD.toString("utf8")),
	rawBody: PAYLOAD,
});

const controller = () =>
	new ControllerCallbackVendorSlack(
		new CallbackVendorSlack(
			{ signingKey: SIGNING_KEY, botToken: "xoxb-foo" },
			{} as ISnapshotDeferIngest,
		),
	);

test("a slash command", async (t: TestContext) => {
	await t.test("is not accepted when unconfigured", async (t: TestContext) => {
		t.assert.deepStrictEqual(
			await post(new ControllerCallbackVendorSlack(undefined), request()),
			{
				code: 500,
				contentType: "text/plain",
				body: "callback not configured",
			},
		);
	});

	await t.test(
		"is rejected when its timestamp is out of sync",
		async (t: TestContext) => {
			t.mock.timers.enable({
				apis: ["Date"],
				now: TIMESTAMP * 1000 + 10 * 1000,
			});

			t.assert.deepStrictEqual(await post(controller(), request()), {
				code: 400,
				contentType: "text/plain",
				body: "request timestamp too far out of sync",
			});

			t.mock.timers.reset();
		},
	);

	await t.test(
		"is rejected when its signature does not verify",
		async (t: TestContext) => {
			t.mock.timers.enable({ apis: ["Date"], now: TIMESTAMP * 1000 });

			t.assert.deepStrictEqual(
				await post(
					controller(),
					request(
						"v0=b2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
					),
				),
				{
					code: 400,
					contentType: "text/plain",
					body: "request payload verification failed",
				},
			);

			t.mock.timers.reset();
		},
	);

	await t.test("is handled when genuine", async (t: TestContext) => {
		t.mock.timers.enable({ apis: ["Date"], now: TIMESTAMP * 1000 });

		t.assert.deepStrictEqual(await post(controller(), request()), {
			body: {
				blocks: [
					{
						text: {
							text: "unknown command 😔",
							type: "mrkdwn",
						},
						type: "section",
					},
				],
				response_type: "ephemeral",
			},
			code: 200,
			contentType: "application/json",
		});

		t.mock.timers.reset();
	});

	await t.test(
		"is not handled without the payload as it arrived",
		(t: TestContext) => {
			const { headers, body } = request();

			t.assert.throws(
				() => post(controller(), { headers, body }),
				(error: unknown) =>
					error instanceof InternalServerErrorException &&
					error.getStatus() === 500,
			);
		},
	);
});
