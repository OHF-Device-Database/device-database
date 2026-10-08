import type { TestContext } from "node:test";

import { CallbackVendorSlack } from "..";

import type { IDatabase } from "../../../../database";
import type { DatabaseName } from "../../../../database/base";
import type { ISchedulerCoordinator } from "../../../../scheduler/coordinator";
import type { ISnapshotDeferIngest } from "../../../../snapshot/defer/ingest";
import type { ParsedCommandTextError } from "./base";

/* node:coverage disable */

export const ctx = {
	responseUrl: "https://hooks.slack.com/commands/T1DC2JH3J/397700885554/0",
	userId: "U2CERLKJA",
};

export const build = (
	options?:
		| {
				scheduler?: ISchedulerCoordinator | undefined;
				databases?:
					| Partial<Record<DatabaseName, IDatabase<DatabaseName>>>
					| undefined;
		  }
		| undefined,
) =>
	new CallbackVendorSlack(
		{ signingKey: "8f742231b10e8888abcd99yyyzzz85a5", botToken: "xoxb-foo" },
		{} as ISnapshotDeferIngest,
		options?.scheduler,
		options?.databases,
	);

export const texts = (handled: { blocks: unknown[] }): string[] =>
	handled.blocks.flatMap((block) =>
		typeof block === "object" &&
		block !== null &&
		"text" in block &&
		typeof block.text === "object" &&
		block.text !== null &&
		"text" in block.text &&
		typeof block.text.text === "string"
			? [block.text.text]
			: [],
	);

/** messages a parse rejected its text with, empty when it parsed */
export const errors = (
	parsed: { kind: "parsed" } | ParsedCommandTextError,
): string[] =>
	parsed.kind === "parsed"
		? []
		: parsed.blocks.flatMap((block) =>
				"text" in block ? [block.text.text] : [],
			);

export type StubbedCall = { path: string; body: Record<string, unknown> };

export const stubChannelId = "D2CERLKJA";
export const stubMessageTs = "1760005665.000100";

export const stubSlackApi = (
	t: TestContext,
	until: (call: StubbedCall) => boolean,
): { calls: StubbedCall[]; reached: Promise<void> } => {
	const calls: StubbedCall[] = [];

	let settle: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		settle = resolve;
	});

	t.mock.method(
		globalThis,
		"fetch",
		(input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const path = String(input).replace("https://slack.com/api/", "");
			const call: StubbedCall = {
				path,
				body: JSON.parse(String(init?.body)) as Record<string, unknown>,
			};
			calls.push(call);

			if (until(call)) {
				settle();
			}

			return Promise.resolve({
				json: () =>
					Promise.resolve(
						path === "conversations.open"
							? { ok: true, channel: { id: stubChannelId } }
							: { ok: true, channel: stubChannelId, ts: stubMessageTs },
					),
			} as unknown as Response);
		},
	);

	return { calls, reached };
};

/** blocks of a recorded call body, in the shape `texts` wants */
export const posted = (call: StubbedCall): { blocks: unknown[] } => ({
	blocks: Array.isArray(call.body.blocks) ? call.body.blocks : [],
});

/* node:coverage enable */
