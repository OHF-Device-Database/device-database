import { createHmac, timingSafeEqual } from "node:crypto";

import { createType, inject } from "@lppedd/di-wise-neo";

import { ISnapshotDeferIngest } from "../../../snapshot/defer/ingest";
import { CallbackVendorSlackBase } from "./base";
import { blockMrkdwn } from "./block";
import { ephemeral } from "./command/base";
import {
	mixinCommandDatabaseIngest,
	parseableCommandDatabaseIngest,
} from "./command/database-ingest";
import {
	mixinCommandDatabaseQuery,
	parseableCommandDatabaseQuery,
} from "./command/database-query";
import {
	mixinCommandDatabaseScheduler,
	parseableCommandDatabaseScheduler,
} from "./command/database-scheduler";
import { parseCommandText } from "./parse";

import type { IDatabase } from "../../../database";
import type { DatabaseName } from "../../../database/base";
import type { ISchedulerCoordinator } from "../../../scheduler/coordinator";
import type { HandleContext, Handled } from "./command/base";

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
	handle(command: string, text: string, ctx: HandleContext): Promise<Handled>;
}

export const ICallbackVendorSlack = createType<ICallbackVendorSlack>(
	"ICallbackVendorSlack",
);

/** every command this vendor answers, folded onto the shared base */
const CallbackVendorSlackCommands = mixinCommandDatabaseQuery(
	mixinCommandDatabaseScheduler(
		mixinCommandDatabaseIngest(CallbackVendorSlackBase),
	),
);

export class CallbackVendorSlack
	extends CallbackVendorSlackCommands
	implements ICallbackVendorSlack
{
	// mixins erase the base's signature to a variadic rest, so it is restated here
	constructor(
		secrets: { signingKey: string; botToken: string },
		ingest = inject(ISnapshotDeferIngest),
		scheduler?: ISchedulerCoordinator | undefined,
		databases?:
			| Partial<Record<DatabaseName, IDatabase<DatabaseName>>>
			| undefined,
	) {
		super(secrets, ingest, scheduler, databases);
	}

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

	async handle(
		command: string,
		text: string,
		ctx: HandleContext,
	): Promise<Handled> {
		switch (command) {
			case parseableCommandDatabaseIngest: {
				const parsed = parseCommandText(command, text);
				if (parsed.kind === "error") {
					return ephemeral(...parsed.blocks);
				}

				return this.handleCommandDatabaseIngest(parsed, ctx);
			}
			case parseableCommandDatabaseScheduler: {
				const parsed = parseCommandText(command, text);
				if (parsed.kind === "error") {
					return ephemeral(...parsed.blocks);
				}

				return this.handleCommandDatabaseScheduler(parsed, ctx);
			}
			case parseableCommandDatabaseQuery: {
				const parsed = parseCommandText(command, text);
				if (parsed.kind === "error") {
					return ephemeral(...parsed.blocks);
				}

				return this.handleCommandDatabaseQuery(parsed);
			}
			default:
				return ephemeral(blockMrkdwn("unknown command 😔"));
		}
	}
}
