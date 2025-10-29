import { inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../../../config";

import type { Event, ISignalProvider } from "../../base";

const supported = [] as const;
type SupportedEventKind = (typeof supported)[number];

// biome-ignore lint/correctness/noUnusedVariables: will be used again
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
		private webhookUrl: WebhookUrl = inject(ConfigProvider)(() => ({})),
	) {}

	async send(): Promise<void> {
    return;
	}

	supported(event: Event): boolean {
		return (Object.keys(this.webhookUrl) as readonly string[]).includes(
			event.kind,
		);
	}
}
