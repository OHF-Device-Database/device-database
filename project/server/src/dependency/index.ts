import { createContainer, Scope } from "@lppedd/di-wise-neo";

import { config } from "../config";
import { Database, IDatabase } from "../service/database";
import { ISignal, Signal } from "../service/signal";
import { ISignalProvider } from "../service/signal/base";
import { SignalProviderSlack } from "../service/signal/provider/slack";
import { ISnapshot, Snapshot } from "../service/snapshot";

export const container = createContainer({ defaultScope: Scope.Container });

container.register(IDatabase, {
	useFactory: () => new Database(config.database.path, false),
});

container.register(ISnapshot, { useClass: Snapshot });

container.register(ISignalProvider, {
	useFactory: () =>
		new SignalProviderSlack({
			submission: config.vendor.slack.webhook.submission ?? undefined,
		}),
});

container.register(ISignal, { useClass: Signal });
