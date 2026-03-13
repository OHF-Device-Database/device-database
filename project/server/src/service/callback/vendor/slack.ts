import { createHmac, timingSafeEqual } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { createType, inject } from "@lppedd/di-wise-neo";
import { formatDistanceToNow } from "date-fns";
import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { isNone } from "../../../type/maybe";
import {
	DatabaseSnapshotCoordinatorName,
	DatabaseSnapshotCoordinators,
} from "../../database/snapshot-coordinator/base";
import { IIngress } from "../../ingress";
import { IVoucher } from "../../voucher";

import type { IDatabaseSnapshotCoordinator } from "../../database/snapshot-coordinator";

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

type HandleContext = {
	responseUrl: string;
	userId: string;
};

const parseableCommandDatabaseSnapshot = "/database-snapshot-testing" as const;
type ParseableCommandDatabaseSnapshot = typeof parseableCommandDatabaseSnapshot;
type ParseableCommand = ParseableCommandDatabaseSnapshot;

type ParsedCommandTextParsed<T> = {
	kind: "parsed";
	inner: T;
};
type ParsedCommandTextCommandDatabaseSnapshot = ParsedCommandTextParsed<{
	coordinator: {
		self: IDatabaseSnapshotCoordinator;
		name: DatabaseSnapshotCoordinatorName;
	};
	age: "fresh" | "stale";
}>;
type ParsedCommandTextError = {
	kind: "error";
	blocks: Block[];
};
type ParsedCommandTextCommand = ParsedCommandTextCommandDatabaseSnapshot;

const ResponseConversationOpen = Schema.Struct({
	ok: Schema.Literal(true),
	channel: Schema.Struct({
		id: Schema.String,
	}),
});

const ResponseChatPostMessage = Schema.Struct({
	ok: Schema.Literal(true),
	channel: Schema.String,
	ts: Schema.String,
});

export interface ICallbackVendorSlack {
	/**
	 * @param {number} timestamp in seconds
	 * @param {ArrayBuffer} body raw request body
	 */
	genuine(timestamp: number, signature: Buffer, body: Buffer): GenuineResult;
	handle(command: string, text: string, ctx: HandleContext): Promise<Handled>;
}

export const ICallbackVendorSlack = createType<ICallbackVendorSlack>(
	"ICallbackVendorSlack",
);

export class CallbackVendorSlack implements ICallbackVendorSlack {
	constructor(
		private readonly secrets: { signingKey: string; botToken: string },
		private readonly coodinators = inject(DatabaseSnapshotCoordinators),
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

		const hmac = createHmac("sha256", this.secrets.signingKey);
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

	private parseCommandText(
		command: ParseableCommandDatabaseSnapshot,
		text: string,
	): ParsedCommandTextCommandDatabaseSnapshot | ParsedCommandTextError;
	private parseCommandText(
		command: ParseableCommand,
		text: string,
	): ParsedCommandTextCommand | ParsedCommandTextError {
		switch (command) {
			case parseableCommandDatabaseSnapshot: {
				const split = text.split(" ");

				const snapshotName = split.at(0);
				if (typeof snapshotName === "undefined") {
					return {
						kind: "error",
						blocks: [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: `missing snapshot name (supported: ${Object.keys(
										this.coodinators,
									)
										.map((item) => `\`${item}\``)
										.join(", ")})`,
								},
							},
						],
					};
				}

				if (!Schema.is(DatabaseSnapshotCoordinatorName)(snapshotName)) {
					return {
						kind: "error",
						blocks: [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: `unknown snapshot name (supported: ${Object.keys(
										this.coodinators,
									)
										.map((item) => `\`${item}\``)
										.join(", ")})`,
								},
							},
						],
					};
				}

				const age = split.at(1);
				if (
					!(typeof age === "undefined" || age === "stale" || age === "fresh")
				) {
					return {
						kind: "error",
						blocks: [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: `unsupported age (supported: stale, fresh)`,
								},
							},
						],
					};
				}

				const coordinator = this.coodinators[snapshotName];
				if (typeof coordinator === "undefined") {
					return {
						kind: "error",
						blocks: [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: `unknown snapshot name (supported: ${Object.keys(
										this.coodinators,
									)
										.map((item) => `\`${item}\``)
										.join(", ")})`,
								},
							},
						],
					};
				}

				return {
					kind: "parsed",
					inner: {
						coordinator: { self: coordinator, name: snapshotName },
						age: age ?? "stale",
					},
				};
			}
		}
	}

	private static progressBar(percentage: number, length = 20): string {
		const blocks = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

		const clamped = Math.max(0, Math.min(1, percentage));
		const total = clamped * length;

		const full = Math.floor(total);
		const remainder = total - full;

		const partialIndex = Math.round(remainder * (blocks.length - 1));

		let bar = "█".repeat(full);

		if (full < length && partialIndex > 0) {
			bar += blocks[partialIndex];
		}

		const used = full + (partialIndex > 0 ? 1 : 0);
		bar += " ".repeat(length - used);

		return `\`|${bar}|\` ${Math.floor(percentage * 100)}%`;
	}

	private async handleCommandDatabaseSnapshotStale(
		parsed: ParsedCommandTextCommandDatabaseSnapshot,
	): Promise<Handled> {
		const handle = await parsed.inner.coordinator.self.stale();
		if (isNone(handle)) {
			return {
				response_type: "ephemeral",
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `no stale snapshot available, use \`${parseableCommandDatabaseSnapshot} ${parsed.inner.coordinator.name} fresh\` to request a new snapshot`,
						},
					},
				],
			};
		} else {
			const stat = await handle.stat();

			await handle.close();

			const voucher = this.voucher.create("database-snapshot", new Date(), {
				coordinator: parsed.inner.coordinator.name,
			});
			const url = this.ingress.url.databaseSnapshot(voucher);

			return {
				response_type: "ephemeral",
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `database snapshot was created ${formatDistanceToNow(stat.birthtime)} ago`,
						},
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `use <${url}|this link> to download snapshot (it expires quickly!)`,
						},
					},
				],
			};
		}
	}

	private async handleCommandDatabaseSnapshot(
		parsed: ParsedCommandTextCommandDatabaseSnapshot,
		ctx: Pick<HandleContext, "userId">,
	): Promise<Handled> {
		if (parsed.inner.age === "stale") {
			return await this.handleCommandDatabaseSnapshotStale(parsed);
		}

		let channelId;
		{
			// starting conversation
			const response = await fetch("https://slack.com/api/conversations.open", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.secrets.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					users: ctx.userId,
				}),
			});

			const parsed = await response.json();
			const decoded = Schema.decodeUnknownEither(ResponseConversationOpen)(
				parsed,
			);
			if (isLeft(decoded)) {
				return {
					response_type: "ephemeral",
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "could not open conversation 😰",
							},
						},
					],
				};
			}

			channelId = decoded.right.channel.id;
		}

		let messageTs;
		{
			// create message that is subsequently updated
			const response = await fetch("https://slack.com/api/chat.postMessage", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.secrets.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					channel: channelId,
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: CallbackVendorSlack.progressBar(0),
							},
						},
					],
				}),
			});

			const parsed = await response.json();
			const decoded = Schema.decodeUnknownEither(ResponseChatPostMessage)(
				parsed,
			);
			if (isLeft(decoded)) {
				return {
					response_type: "ephemeral",
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "could not create initial message 😰",
							},
						},
					],
				};
			}

			messageTs = decoded.right.ts;
		}

		void (async () => {
			for await (const progress of parsed.inner.coordinator.self.fresh()) {
				await fetch("https://slack.com/api/chat.update", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.secrets.botToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						channel: channelId,
						ts: messageTs,
						blocks: [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: CallbackVendorSlack.progressBar(
										progress.currentSnapshotSize /
											progress.originalSizeEstimate,
									),
								},
							},
						],
					}),
				});

				await setTimeout(5_000);
			}

			await fetch("https://slack.com/api/chat.update", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.secrets.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					channel: channelId,
					ts: messageTs,
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: CallbackVendorSlack.progressBar(1),
							},
						},
					],
				}),
			});

			await fetch("https://slack.com/api/chat.postMessage", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.secrets.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					channel: channelId,
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: `snapshot complete, request download link with \`${parseableCommandDatabaseSnapshot} ${parsed.inner.coordinator.name} stale\``,
							},
						},
					],
				}),
			});
		})();

		return {
			response_type: "ephemeral",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `head over to <#${channelId}> to observe snapshotting status ⌛️`,
					},
				},
			],
		};
	}

	async handle(
		command: string,
		text: string,
		ctx: HandleContext,
	): Promise<Handled> {
		switch (command) {
			case parseableCommandDatabaseSnapshot: {
				const parsed = this.parseCommandText(command, text);
				if (parsed.kind === "error") {
					return {
						response_type: "ephemeral",
						blocks: parsed.blocks,
					};
				}

				return this.handleCommandDatabaseSnapshot(parsed, ctx);
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
