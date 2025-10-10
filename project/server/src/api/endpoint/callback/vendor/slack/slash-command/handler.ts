import { Schema } from "effect/index";
import type { PickDeep } from "type-fest";

import { effectfulEndpoint } from "../../../../../base";

import type { Dependency } from "../../../../../dependency";

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"x-slack-signature": Schema.String,
		"x-slack-request-timestamp": Schema.NumberFromString,
	}),
});

const RequestBody = Schema.Struct({
	command: Schema.String,
	text: Schema.String,
});

export const postCallbackVendorSlackSlashCommand = (
	d: PickDeep<Dependency, "callback.vendor.slack">,
) =>
	effectfulEndpoint(
		"/api/v1/callback/vendor/slack/slash-command",
		"post",
		Parameters,
		"application/x-www-form-urlencoded",
		RequestBody,
		async (parameters, requestBody, context) => {
			if (typeof d.callback.vendor.slack === "undefined") {
				return { code: 500, body: "callback not configured" } as const;
			}
			const timestamp = parameters.header["x-slack-request-timestamp"];
			const signature = Buffer.from(
				parameters.header["x-slack-signature"],
				"utf-8",
			);

			const body = Buffer.from(context.raw.requestBody);
			const genuine = d.callback.vendor.slack.genuine(
				timestamp,
				signature,
				body,
			);

			switch (genuine) {
				case "not-genuine-timestamp":
					return {
						code: 400,
						body: "request timestamp too far out of sync",
					} as const;
				case "not-genuine-signature":
					return {
						code: 400,
						body: "request payload verification failed",
					} as const;
				case "genuine":
					break;
			}

			const response = await d.callback.vendor.slack.handle(
				requestBody.command,
				requestBody.text,
			);

			return { code: 200, body: response } as const;
		},
		{ raw: { requestBody: true } },
	);
