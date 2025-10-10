import { inject } from "@lppedd/di-wise-neo";
import { fetch } from "undici";

import { ConfigProvider } from "../../../../config";

import type { Event, ISignalProvider } from "../../base";

const supported = ["submission"] as const;
type SupportedEventKind = (typeof supported)[number];

type SupportedEvent = Extract<
	Event,
	// biome-ignore lint/suspicious/noExplicitAny: distributive union
	SupportedEventKind extends any ? { kind: SupportedEventKind } : never
>;

type WebhookUrl = { [K in SupportedEventKind]: string | undefined };

export interface ISignalProviderSlack extends ISignalProvider {}

export const templateMarkdown = (markdown: string) =>
	({
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: markdown,
				},
			},
		],
	}) as const;

export class SignalProviderSlack implements ISignalProviderSlack {
	constructor(
		private webhookUrl: WebhookUrl = inject(ConfigProvider)((c) => ({
			submission: c.vendor.slack.webhook.submission ?? undefined,
		})),
	) {}

	async send(event: SupportedEvent): Promise<void> {
		switch (event.kind) {
			case "submission": {
				if (typeof this.webhookUrl.submission === "undefined") {
					break;
				}

				const { id, version, contact } = event.context;

				let markdown;
				if (typeof version !== "undefined") {
					markdown = `\`v${event.context.version}\` snapshot from *${contact}* (\`${id}\`)`;
				} else {
					markdown = `received snapshot with unexpected structure from *${contact}* (\`${id}\`)`;
				}

				await fetch(this.webhookUrl.submission, {
					method: "POST",
					body: JSON.stringify(templateMarkdown(markdown)),
					headers: {
						"Content-Type": "application/json",
					},
				});
				break;
			}
			default:
				break;
		}
	}

	supported(event: Event): boolean {
		return (Object.keys(this.webhookUrl) as readonly string[]).includes(
			event.kind,
		);
	}
}
