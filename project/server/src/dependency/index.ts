import { createContainer, Scope } from "@lppedd/di-wise-neo";

import { ConfigProvider, config, configProvider } from "../config";
import {
	CallbackVendorSlack,
	ICallbackVendorSlack,
} from "../service/callback/vendor/slack";
import { Database, IDatabase } from "../service/database";
import { Dispatch, IDispatch } from "../service/dispatch";
import { IDispatchReporter } from "../service/dispatch/base";
import { DispatchReporterConsole } from "../service/dispatch/reporter/console";
import { IIngress, Ingress } from "../service/ingress";
import { ISignal, Signal } from "../service/signal";
import { ISignalProvider } from "../service/signal/base";
import { SignalProviderSlack } from "../service/signal/provider/slack";
import { IVoucher, Voucher } from "../service/voucher";
import { isSome } from "../type/maybe";

export const container = createContainer({ defaultScope: Scope.Container });

container.register(ConfigProvider, {
	useFactory: () => configProvider(config),
});

container.register(IDatabase, { useClass: Database });
container.register(IDispatch, { useClass: Dispatch });
container.register(IDispatchReporter, { useClass: DispatchReporterConsole });
container.register(IIngress, { useClass: Ingress });
container.register(ISignal, { useClass: Signal });
container.register(ISignalProvider, { useClass: SignalProviderSlack });
container.register(IVoucher, { useClass: Voucher });

{
	const signingKey = config().vendor.slack.callback.signingKey;
	if (isSome(signingKey)) {
		container.register(ICallbackVendorSlack, {
			useFactory: () => new CallbackVendorSlack(signingKey),
		});
	}
}
