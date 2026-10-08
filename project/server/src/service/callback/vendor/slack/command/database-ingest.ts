import { SuspendableHandle } from "../../../../suspendable";
import { blockMrkdwn } from "../block";
import { CallbackVendorSlackSymbol } from "./base";

import type { CallbackVendorSlackBase } from "../base";
import type {
	Constructor,
	HandleContext,
	Handled,
	ParsedCommandTextError,
	ParsedCommandTextParsed,
} from "./base";

export const parseableCommandDatabaseIngest = "/database-ingest" as const;
export type ParseableCommandDatabaseIngest =
	typeof parseableCommandDatabaseIngest;

export type ParsedCommandTextCommandDatabaseIngest = ParsedCommandTextParsed<{
	action: "suspend" | "resume";
}>;

export const parseCommandTextDatabaseIngest = (
	text: string,
): ParsedCommandTextCommandDatabaseIngest | ParsedCommandTextError => {
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
				blocks: [blockMrkdwn(`unknown action (known: suspend, resume)`)],
			};
	}
};

export const mixinCommandDatabaseIngest = <
	T extends Constructor<CallbackVendorSlackBase>,
>(
	Base: T,
) =>
	class extends Base {
		protected async handleCommandDatabaseIngest(
			parsed: ParsedCommandTextCommandDatabaseIngest,
			ctx: Pick<HandleContext, "userId">,
		): Promise<Handled> {
			const handle = new SuspendableHandle(
				CallbackVendorSlackSymbol,
				ctx.userId,
			);

			switch (parsed.inner.action) {
				case "suspend":
					return this.suspend(this.ingest, handle, ctx);
				case "resume":
					return this.resume(this.ingest, handle);
			}
		}
	};
