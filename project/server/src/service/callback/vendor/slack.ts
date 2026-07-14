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
import { ISnapshotDeferIngest } from "../../snapshot/defer/ingest";
import { SuspendableHandle } from "../../suspendable";
import { IVoucher } from "../../voucher";

import type { IDatabaseSnapshotCoordinator } from "../../database/snapshot-coordinator";

type BlockText = {
	type: "mrkdwn";
	text: string;
};
type BlockField = {
	type: "mrkdwn";
	text: string;
};

type Block = {
	type: "section";
} & (
	| {
			text: BlockText;
			fields: BlockField[];
	  }
	| {
			text: BlockText;
	  }
	| {
			fields: BlockField[];
	  }
);

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

const parseableCommandDatabaseSnapshot = "/database-snapshot" as const;
const parseableCommandDatabaseIngest = "/database-ingest" as const;
type ParseableCommandDatabaseSnapshot = typeof parseableCommandDatabaseSnapshot;
type ParseableCommandDatabaseIngest = typeof parseableCommandDatabaseIngest;
type ParseableCommand =
	| ParseableCommandDatabaseSnapshot
	| ParseableCommandDatabaseIngest;

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
type ParsedCommandTextCommandDatabaseIngest = ParsedCommandTextParsed<{
	action: "suspend" | "resume";
}>;
type ParsedCommandTextError = {
	kind: "error";
	blocks: Block[];
};
type ParsedCommandTextCommand =
	| ParsedCommandTextCommandDatabaseSnapshot
	| ParsedCommandTextCommandDatabaseIngest;

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

const CallbackVendorSlackSymbol = Symbol("CallbackVendorSlack");

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

const mrkdwnBlock = (text: string): Block => ({
	type: "section",
	text: {
		type: "mrkdwn",
		text,
	},
});

const ephemeral = (...blocks: Block[]): Handled => ({
	response_type: "ephemeral",
	blocks,
});

export class CallbackVendorSlack implements ICallbackVendorSlack {
	constructor(
		private readonly secrets: { signingKey: string; botToken: string },
		private readonly coodinators = inject(DatabaseSnapshotCoordinators),
		private ingest = inject(ISnapshotDeferIngest),
		private ingress = inject(IIngress),
		private voucher = inject(IVoucher),
	) {}

	// https://docs.slack.dev/authentication/verifying-requests-from-slack
	genuine(timestamp: number, signature: Buffer, body: Buffer): GenuineResult {
		const now = Date.now() / 1000;

		// prevent replay attacks
		// request timestamp and current time should not be more than 10sec out of sync
		// slack recommends 5 minutes, but that's an _awfully_ long time
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

	private async post(path: string, body: object): Promise<unknown> {
		const response = await fetch(`https://slack.com/api/${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.secrets.botToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		return response.json();
	}

	private async openConversation(userId: string): Promise<string | null> {
		const parsed = await this.post("conversations.open", {
			users: userId,
		});
		const decoded = Schema.decodeUnknownEither(ResponseConversationOpen)(
			parsed,
		);
		if (isLeft(decoded)) {
			return null;
		}

		return decoded.right.channel.id;
	}

	private async postMessage(
		channelId: string,
		blocks: Block[],
	): Promise<string | null> {
		const parsed = await this.post("chat.postMessage", {
			channel: channelId,
			blocks,
		});
		const decoded = Schema.decodeUnknownEither(ResponseChatPostMessage)(parsed);
		if (isLeft(decoded)) {
			return null;
		}

		return decoded.right.ts;
	}

	private async updateMessage(
		channelId: string,
		ts: string,
		blocks: Block[],
	): Promise<void> {
		await this.post("chat.update", { channel: channelId, ts, blocks });
	}

	private parseCommandText(
		command: ParseableCommandDatabaseSnapshot,
		text: string,
	): ParsedCommandTextCommandDatabaseSnapshot | ParsedCommandTextError;
	private parseCommandText(
		command: ParseableCommandDatabaseIngest,
		text: string,
	): ParsedCommandTextCommandDatabaseIngest | ParsedCommandTextError;
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
							mrkdwnBlock(
								`missing snapshot name (supported: ${Object.keys(
									this.coodinators,
								)
									.map((item) => `\`${item}\``)
									.join(", ")})`,
							),
						],
					};
				}

				if (!Schema.is(DatabaseSnapshotCoordinatorName)(snapshotName)) {
					return {
						kind: "error",
						blocks: [
							mrkdwnBlock(
								`unknown snapshot name (supported: ${Object.keys(
									this.coodinators,
								)
									.map((item) => `\`${item}\``)
									.join(", ")})`,
							),
						],
					};
				}

				const age = split.at(1);
				if (
					!(typeof age === "undefined" || age === "stale" || age === "fresh")
				) {
					return {
						kind: "error",
						blocks: [mrkdwnBlock(`unsupported age (supported: stale, fresh)`)],
					};
				}

				const coordinator = this.coodinators[snapshotName];
				if (typeof coordinator === "undefined") {
					return {
						kind: "error",
						blocks: [
							mrkdwnBlock(
								`unknown snapshot name (supported: ${Object.keys(
									this.coodinators,
								)
									.map((item) => `\`${item}\``)
									.join(", ")})`,
							),
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
			case parseableCommandDatabaseIngest: {
				const trimmed = text.trim();
				switch (trimmed) {
					case "suspend":
						return {
							kind: "parsed",
							inner: { action: "suspend" },
						};
					case "resume":
						return {
							kind: "parsed",
							inner: { action: "resume" },
						};
					default:
						return {
							kind: "error",
							blocks: [
								mrkdwnBlock(`unknown action (supported: suspend, resume)`),
							],
						};
				}
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
			return ephemeral(
				mrkdwnBlock(
					`no stale snapshot available, use \`${parseableCommandDatabaseSnapshot} ${parsed.inner.coordinator.name} fresh\` to request a new snapshot`,
				),
			);
		} else {
			const stat = await handle.stat();

			await handle.close();

			const voucher = this.voucher.create("database-snapshot", new Date(), {
				coordinator: parsed.inner.coordinator.name,
			});
			const url = this.ingress.url.databaseSnapshot(voucher);

			return ephemeral(
				mrkdwnBlock(
					`database snapshot was created ${formatDistanceToNow(stat.birthtime)} ago`,
				),
				mrkdwnBlock(
					`use <${url}|this link> to download snapshot (it expires quickly!)`,
				),
			);
		}
	}

	private async handleCommandDatabaseSnapshot(
		parsed: ParsedCommandTextCommandDatabaseSnapshot,
		ctx: Pick<HandleContext, "userId">,
	): Promise<Handled> {
		if (parsed.inner.age === "stale") {
			return await this.handleCommandDatabaseSnapshotStale(parsed);
		}

		const channelId = await this.openConversation(ctx.userId);
		if (channelId === null) {
			return ephemeral(mrkdwnBlock("could not open conversation 😰"));
		}

		const messageTs = await this.postMessage(channelId, [
			mrkdwnBlock(CallbackVendorSlack.progressBar(0)),
		]);
		if (messageTs === null) {
			return ephemeral(mrkdwnBlock("could not create initial message 😰"));
		}

		void (async () => {
			for await (const progress of parsed.inner.coordinator.self.fresh()) {
				await this.updateMessage(channelId, messageTs, [
					mrkdwnBlock(
						CallbackVendorSlack.progressBar(
							progress.currentSnapshotSize / progress.originalSizeEstimate,
						),
					),
				]);

				await setTimeout(5_000);
			}

			await this.updateMessage(channelId, messageTs, [
				mrkdwnBlock(CallbackVendorSlack.progressBar(1)),
			]);

			await this.postMessage(channelId, [
				mrkdwnBlock(
					`snapshot complete, request download link with \`${parseableCommandDatabaseSnapshot} ${parsed.inner.coordinator.name} stale\``,
				),
			]);
		})();

		return ephemeral(
			mrkdwnBlock(
				`head over to <#${channelId}> to observe snapshotting status ⌛️`,
			),
		);
	}

	private async handleCommandDatabaseIngest(
		parsed: ParsedCommandTextCommandDatabaseIngest,
		ctx: Pick<HandleContext, "userId">,
	): Promise<Handled> {
		const handle = new SuspendableHandle(CallbackVendorSlackSymbol, ctx.userId);

		switch (parsed.inner.action) {
			case "suspend": {
				const channelId = await this.openConversation(ctx.userId);
				if (channelId === null) {
					return ephemeral(mrkdwnBlock("could not open conversation 😰"));
				}

				void (async () => {
					await this.ingest.suspend(handle);
					await this.postMessage(channelId, [mrkdwnBlock("suspended ⏸️")]);
				})();

				return ephemeral(
					mrkdwnBlock(
						`suspending, will notify over in <#${channelId}> once suspended ⌛️`,
					),
				);
			}
			case "resume": {
				const result = this.ingest.resume(handle);
				if (result.remaining.length > 0) {
					return ephemeral(
						mrkdwnBlock(
							`${result.inert ? "not previously suspended" : "resume requested"}, currently *${result.remaining.length}* suspensions remaining`,
						),
						{
							type: "section",
							fields: result.remaining.map((item) => ({
								type: "mrkdwn",
								text: `*${item.description ?? "—"}*\n${item.tag ?? "—"}`,
							})),
						},
					);
				}

				return ephemeral(
					mrkdwnBlock(result.inert ? "not previously suspended" : "resumed ▶️"),
				);
			}
		}
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
					return ephemeral(...parsed.blocks);
				}

				return this.handleCommandDatabaseSnapshot(parsed, ctx);
			}
			case parseableCommandDatabaseIngest: {
				const parsed = this.parseCommandText(command, text);
				if (parsed.kind === "error") {
					return ephemeral(...parsed.blocks);
				}

				return this.handleCommandDatabaseIngest(parsed, ctx);
			}
			default:
				return ephemeral(mrkdwnBlock("unknown command 😔"));
		}
	}
}
