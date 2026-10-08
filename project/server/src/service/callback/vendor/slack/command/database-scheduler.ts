import { formatNs } from "../../../../../utility/format";
import { Scheduler } from "../../../../scheduler";
import { SuspendableHandle } from "../../../../suspendable";
import { blockMrkdwn } from "../block";
import {
	CallbackVendorSlackSymbol,
	described,
	ephemeral,
	reason,
	words,
} from "./base";

import type { CallbackVendorSlackBase } from "../base";
import type {
	Constructor,
	HandleContext,
	Handled,
	ParsedCommandTextError,
	ParsedCommandTextParsed,
} from "./base";

export const parseableCommandDatabaseScheduler = "/database-scheduler" as const;
export type ParseableCommandDatabaseScheduler =
	typeof parseableCommandDatabaseScheduler;

export type ParsedCommandTextCommandDatabaseScheduler = ParsedCommandTextParsed<
	{ action: "suspend" | "resume" } | { action: "run"; scheduleable: string }
>;

export const parseCommandTextDatabaseScheduler = (
	text: string,
): ParsedCommandTextCommandDatabaseScheduler | ParsedCommandTextError => {
	const [arg0, arg1, ...remaining] = words(text);
	if (remaining.length > 0) {
		return {
			kind: "error",
			blocks: [blockMrkdwn(`excess parameter, only two expected`)],
		};
	}
	switch (arg0) {
		case "suspend":
			if (typeof arg1 !== "undefined") {
				return {
					kind: "error",
					blocks: [blockMrkdwn(`excess parameter, only one expected`)],
				};
			}
			return {
				kind: "parsed",
				inner: { action: "suspend" },
			};
		case "resume":
			if (typeof arg1 !== "undefined") {
				return {
					kind: "error",
					blocks: [blockMrkdwn(`excess parameter, only one expected`)],
				};
			}
			return {
				kind: "parsed",
				inner: { action: "resume" },
			};
		case "run": {
			if (typeof arg1 === "undefined") {
				return {
					kind: "error",
					blocks: [
						blockMrkdwn("missing parameter, scheduleable name expected"),
					],
				};
			}

			return {
				kind: "parsed",
				inner: { action: "run", scheduleable: arg1 },
			};
		}
		default:
			return {
				kind: "error",
				blocks: [blockMrkdwn(`unknown action (known: suspend, resume, run)`)],
			};
	}
};

export const mixinCommandDatabaseScheduler = <
	T extends Constructor<CallbackVendorSlackBase>,
>(
	Base: T,
) =>
	class extends Base {
		protected async handleCommandDatabaseScheduler(
			parsed: ParsedCommandTextCommandDatabaseScheduler,
			ctx: Pick<HandleContext, "userId">,
		): Promise<Handled> {
			const scheduler = this.scheduler;
			if (typeof scheduler === "undefined") {
				return ephemeral(blockMrkdwn("scheduler not available 😔"));
			}

			const handle = new SuspendableHandle(
				CallbackVendorSlackSymbol,
				ctx.userId,
			);

			switch (parsed.inner.action) {
				case "suspend":
					return this.suspend(scheduler, handle, ctx);
				case "resume":
					return this.resume(scheduler, handle);
				case "run": {
					const handle = new SuspendableHandle(
						CallbackVendorSlackSymbol,
						`${ctx.userId}:run`,
					);

					const wanted = parsed.inner.scheduleable.toLowerCase();

					const scheduleable = [...scheduler.scheduleable()].filter(
						(s) => typeof s.description !== "undefined",
					);
					if (scheduleable.length === 0) {
						return ephemeral(
							blockMrkdwn(`unknown scheduleable (no known scheduleable units)`),
						);
					}

					const id = scheduleable.find(
						// `described` renders for slack, the description is the external identifier
						(item) => item.description?.toLowerCase() === wanted,
					);
					if (typeof id === "undefined") {
						return ephemeral(
							blockMrkdwn(
								`unknown scheduleable (known: ${scheduleable.map((s) => described(s))})`,
							),
						);
					}

					const plan = scheduler.plan(id);
					if (!Scheduler.viable(plan)) {
						return ephemeral(
							blockMrkdwn(
								`plan for *${described(id)}* not viable <${JSON.stringify(plan)}> 😰`,
							),
						);
					}

					const channelId = await this.openConversation(ctx.userId);
					if (channelId === null) {
						return ephemeral(blockMrkdwn("could not open conversation 😰"));
					}

					void (async () => {
						// statuses are reported as replies to this message, as they come in
						const thread =
							(await this.postMessage(channelId, [
								blockMrkdwn(`running *${described(id)}* ▶️`),
							])) ?? undefined;

						const report = (text: string): Promise<string | null> =>
							this.postMessage(channelId, [blockMrkdwn(text)], thread);

						try {
							for await (const status of scheduler.run(plan, handle)) {
								switch (status.kind) {
									case "pending":
										await report(`*${described(status.id)}*\nrunning ⌛️`);
										break;
									case "success":
										await report(
											`*${described(status.id)}*\n${formatNs(status.took)}s ✅`,
										);
										break;
									case "error":
										await report(
											`*${described(status.id)}*\n${reason(status.error)} ❌`,
										);
										break;
								}
							}
						} catch (error) {
							await report(
								`could not run *${described(id)}*, ${reason(error)} 😰`,
							);

							return;
						}

						await report(`ran *${described(id)}* ⏹️`);
					})();

					return ephemeral(
						blockMrkdwn(
							`running *${described(id)}*, will report over in <#${channelId}> as it goes ⌛️`,
						),
					);
				}
			}
		}
	};
