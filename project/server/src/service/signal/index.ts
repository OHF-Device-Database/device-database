import { createType, injectAll } from "@lppedd/di-wise-neo";

import { type Event, ISignalProvider } from "./base";

export const ISignal = createType<ISignal>("ISignal");

export interface ISignal {
	send(event: Event): Promise<void>;
}

export class Signal implements ISignal {
	constructor(private providers = injectAll(ISignalProvider)) {}

	async send(event: Event): Promise<void> {
		for (const provider of this.providers) {
			if (!provider.supported(event)) {
				continue;
			}

			await provider.send(event);
		}
	}
}
