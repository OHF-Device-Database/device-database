import { fetch } from "undici";

import type {
	Event,
	EventSubmissionEitherLeftClash,
	ISignalProvider,
} from "../../base";

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
	constructor(private webhookUrl: WebhookUrl) {}

	async send(event: SupportedEvent): Promise<void> {
		switch (event.kind) {
			case "submission": {
				if (typeof this.webhookUrl.submission === "undefined") {
					break;
				}

				const { id, contact } = event.context;

				let markdown;
				if ("version" in event.context) {
					markdown = `\`v${event.context.version}\` snapshot from *${contact}* (\`${id}\`)`;
				} else {
					const formatClash = (clash: EventSubmissionEitherLeftClash) =>
						`→ \`v${clash.version}\`\n\`\`\`${clash.clash.message}\`\`\``;

					markdown = `received snapshot with unexpected structure from *${contact}* (\`${id}\`)\n${event.context.clashes.map((clash) => formatClash(clash)).join("\n")}`;
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
