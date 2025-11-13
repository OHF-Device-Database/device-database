import { createHmac, timingSafeEqual } from "node:crypto";

import { createType, inject } from "@lppedd/di-wise-neo";

import { IIngress } from "../../ingress";
import { IVoucher } from "../../voucher";

type Block = {
	type: "section";
	text: {
		type: "mrkdwn";
		text: string;
	};
};

type Handled = {
	response_type: "in_channel" | "ephemeral";
	blocks: Block[];
};

type GenuineResult =
	| "genuine"
	| "not-genuine-timestamp"
	| "not-genuine-signature";

export interface ICallbackVendorSlack {
	/**
	 * @param {number} timestamp in seconds
	 * @param {ArrayBuffer} body raw request body
	 */
	genuine(timestamp: number, signature: Buffer, body: Buffer): GenuineResult;
	handle(command: string, text: string): Promise<Handled>;
}

export const ICallbackVendorSlack = createType<ICallbackVendorSlack>(
	"ICallbackVendorSlack",
);

export class CallbackVendorSlack implements ICallbackVendorSlack {
	constructor(
		private signingKey: string,
		private ingress = inject(IIngress),
		private voucher = inject(IVoucher),
	) {}

	// https://docs.slack.dev/authentication/verifying-requests-from-slack
	genuine(timestamp: number, signature: Buffer, body: Buffer): GenuineResult {
		const now = Date.now() / 1000;

		// prevent replay attacks
		// request timestamp and current time should not be more than 10sec out of sync
		// slack recommends 5 minutes, but that's an _awefully_ long time
		const expired = Math.abs(timestamp - now) >= 10;
		if (expired) {
			return "not-genuine-timestamp";
		}

		let decoded: string;
		{
			const decoder = new TextDecoder("utf-8", { fatal: true });
			decoded = decoder.decode(body);
		}

		const concatenated = `v0:${timestamp}:${decoded}`;

		const hmac = createHmac("sha256", this.signingKey);
		hmac.update(concatenated);
		const digested = hmac.digest("hex");

		{
			const a = Buffer.from(`v0=${digested}`);
			const b = signature;

			if (!timingSafeEqual(a, b)) {
				return "not-genuine-signature";
			}
		}

		return "genuine";
	}

	async handle(command: string, _: string): Promise<Handled> {
		switch (command) {
			case "/database-snapshot": {
				const voucher = this.voucher.create("database-snapshot", new Date());
				const url = this.ingress.url.databaseSnapshot(voucher);

				return {
					response_type: "ephemeral",
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: `use <${url}|this link> to download a database snapshot (it expires quickly!)`,
							},
						},
					],
				};
			}
			default:
				return {
					response_type: "ephemeral",
					blocks: [
						{
							type: "section",
							text: { type: "mrkdwn", text: "unknown command 😔" },
						},
					],
				};
		}
	}
}
