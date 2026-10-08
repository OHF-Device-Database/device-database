import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { blockFields, blockMrkdwn } from "./block";
import { ephemeral } from "./command/base";

import type { IDatabase } from "../../../database";
import type { DatabaseName } from "../../../database/base";
import type { ISchedulerCoordinator } from "../../../scheduler/coordinator";
import type { ISnapshotDeferIngest } from "../../../snapshot/defer/ingest";
import type { ISuspendable, SuspendableHandle } from "../../../suspendable";
import type { Block } from "./block";
import type { HandleContext, Handled } from "./command/base";

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

/**
 * state and slack web api surface the command mixins build on
 *
 * lives apart from `index` so command mixins can extend it without the cycle
 * applying them at `index` would otherwise introduce
 */
export class CallbackVendorSlackBase {
	constructor(
		protected readonly secrets: { signingKey: string; botToken: string },
		protected readonly ingest: ISnapshotDeferIngest,
		protected readonly scheduler?: ISchedulerCoordinator | undefined,
		protected readonly databases?:
			| Partial<Record<DatabaseName, IDatabase<DatabaseName>>>
			| undefined,
	) {}

	protected async post(path: string, body: object): Promise<unknown> {
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

	/** opens a direct conversation with `userId`, resolving its channel id */
	protected async openConversation(userId: string): Promise<string | null> {
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

	/** posts `blocks` to `channelId`, resolving the message's `ts` */
	protected async postMessage(
		channelId: string,
		blocks: Block[],
		/** when given, posts as a reply within that message's thread */
		threadTs?: string | undefined,
	): Promise<string | null> {
		const parsed = await this.post("chat.postMessage", {
			channel: channelId,
			blocks,
			// dropped by `JSON.stringify` when undefined
			thread_ts: threadTs,
		});
		const decoded = Schema.decodeUnknownEither(ResponseChatPostMessage)(parsed);
		if (isLeft(decoded)) {
			return null;
		}

		return decoded.right.ts;
	}

	/** suspends `suspendable` out of band, as draining can take a while */
	protected async suspend(
		suspendable: ISuspendable,
		handle: SuspendableHandle,
		ctx: Pick<HandleContext, "userId">,
	): Promise<Handled> {
		const channelId = await this.openConversation(ctx.userId);
		if (channelId === null) {
			return ephemeral(blockMrkdwn("could not open conversation 😰"));
		}

		void (async () => {
			await suspendable.suspend(handle);
			await this.postMessage(channelId, [blockMrkdwn("suspended ⏸️")]);
		})();

		return ephemeral(
			blockMrkdwn(
				`suspending, will notify over in <#${channelId}> once suspended ⌛️`,
			),
		);
	}

	protected resume(
		suspendable: ISuspendable,
		handle: SuspendableHandle,
	): Handled {
		const result = suspendable.resume(handle);
		if (result.remaining.length > 0) {
			return ephemeral(
				blockMrkdwn(
					`${result.inert ? "not previously suspended" : "resume requested"}, currently *${result.remaining.length}* suspensions remaining`,
				),
				blockFields(
					result.remaining.map((item) => ({
						type: "mrkdwn",
						text: `*${item.description ?? "—"}*\n${item.tag ?? "—"}`,
					})),
				),
			);
		}

		return ephemeral(
			blockMrkdwn(result.inert ? "not previously suspended" : "resumed ▶️"),
		);
	}
}
