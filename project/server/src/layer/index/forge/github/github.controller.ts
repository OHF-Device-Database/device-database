import { Controller, Inject } from "@nestjs/common";
import { Schema } from "effect";

import { isNone, type Maybe } from "../../../../type/maybe";
import { RequestBodyRaw } from "../../../http";
import { Route } from "../../../route";
import { ServiceIndex } from "../../index.service";
import { IndexForgeGithub } from "./github.service";

import type { Implements } from "../../../schema";

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"x-github-event": Schema.String,
		"x-hub-signature-256": Schema.String,
	}),
});
type Parameters = typeof Parameters.Type;

const RequestBody = Schema.Struct({
	ref: Schema.optional(Schema.String),
});
type RequestBody = typeof RequestBody.Type;

@Controller()
export class ControllerIndexVendorGithub
	implements Implements<"/api/v1/callback/vendor/github/webhook">
{
	constructor(
		@Inject(ServiceIndex) private readonly service: ServiceIndex,
		@Inject(IndexForgeGithub) private readonly github: Maybe<IndexForgeGithub>,
	) {}

	@Route("post", "/api/v1/callback/vendor/github/webhook", {
		parameters: Parameters,
		requestBody: RequestBody,
	})
	async post(
		parameters: Parameters,
		requestBody: RequestBody,
		@RequestBodyRaw() raw: Buffer,
	) {
		if (isNone(this.github)) {
			return {
				code: 500,
				contentType: "text/plain",
				body: "callback not configured",
			} as const;
		}

		if (!this.github.genuine(parameters.header["x-hub-signature-256"], raw)) {
			return {
				code: 400,
				contentType: "text/plain",
				body: "request payload verification failed",
			} as const;
		}

		if (
			parameters.header["x-github-event"] !== "push" ||
			typeof requestBody.ref === "undefined" ||
			!this.github.tracks(requestBody.ref)
		) {
			return { code: 204 } as const;
		}

		// syncing an unseeded index would walk history from scratch
		if (!(await this.service.available())) {
			return {
				code: 503,
				contentType: "text/plain",
				body: "index unavailable",
			} as const;
		}

		// github gives up on deliveries after 10 seconds → don't wait on sync
		void this.service.request();

		return {
			code: 202,
			contentType: "text/plain",
			body: "accepted",
		} as const;
	}
}
