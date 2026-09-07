import { Controller, Inject, Optional } from "@nestjs/common";
import { Schema } from "effect";

import { RequestBodyRaw } from "../../../http";
import { Route } from "../../../route";
import { CallbackVendorSlack } from "./slack.interface";

import type { Implements } from "../../../schema";

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"x-slack-signature": Schema.String,
		"x-slack-request-timestamp": Schema.NumberFromString,
	}),
});
type Parameters = typeof Parameters.Type;

const RequestBody = Schema.Struct({
	command: Schema.String,
	text: Schema.String,
	response_url: Schema.String,
	user_id: Schema.String,
});
type RequestBody = typeof RequestBody.Type;

@Controller()
export class ControllerCallbackVendorSlack
	implements Implements<"/api/v1/callback/vendor/slack/slash-command">
{
	constructor(
		@Optional()
		@Inject(CallbackVendorSlack)
		private readonly callback: CallbackVendorSlack | undefined,
	) {}

	@Route("post", "/api/v1/callback/vendor/slack/slash-command", {
		parameters: Parameters,
		requestBody: RequestBody,
	})
	async post(
		parameters: Parameters,
		requestBody: RequestBody,
		@RequestBodyRaw() raw: Buffer,
	) {
		if (typeof this.callback === "undefined") {
			return {
				code: 500,
				contentType: "text/plain",
				body: "callback not configured",
			} as const;
		}

		const timestamp = parameters.header["x-slack-request-timestamp"];
		const signature = Buffer.from(
			parameters.header["x-slack-signature"],
			"utf-8",
		);

		const genuine = this.callback.genuine(timestamp, signature, raw);

		switch (genuine) {
			case "not-genuine-timestamp":
				return {
					code: 400,
					contentType: "text/plain",
					body: "request timestamp too far out of sync",
				} as const;
			case "not-genuine-signature":
				return {
					code: 400,
					contentType: "text/plain",
					body: "request payload verification failed",
				} as const;
			case "genuine":
				break;
		}

		const response = await this.callback.handle(
			requestBody.command,
			requestBody.text,
			{
				responseUrl: requestBody.response_url,
				userId: requestBody.user_id,
			},
		);

		return {
			code: 200,
			contentType: "application/json",
			body: response,
		} as const;
	}
}
