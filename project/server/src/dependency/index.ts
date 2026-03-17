import { createContainer, Scope } from "@lppedd/di-wise-neo";

import {
	ConfigProvider,
	config,
	configProvider,
	SnapshotDeferTarget,
} from "../config";
import {
	CallbackVendorSlack,
	ICallbackVendorSlack,
} from "../service/callback/vendor/slack";
import {
	Database,
	IDatabaseDerived,
	IDatabaseStaging,
} from "../service/database";
import { DatabaseSnapshotCoordinator } from "../service/database/snapshot-coordinator";
import { DatabaseSnapshotCoordinators } from "../service/database/snapshot-coordinator/base";
import { Derive, IDeriveDerived } from "../service/derive";
import { IDeriveDerivable } from "../service/derive/base";
import {
	DeriveDerivableDevice,
	IDeriveDerivableDevice,
} from "../service/derive/derivable/device";
import { DeriveDerivableMetaEntityStat } from "../service/derive/derivable/meta";
import { DeriveDerivableSubject } from "../service/derive/derivable/subject";
import { DeriveDerivableSubmissionFaulty } from "../service/derive/derivable/submission";
import { Dispatch, IDispatch } from "../service/dispatch";
import { IDispatchReporter } from "../service/dispatch/base";
import { DispatchReporterConsole } from "../service/dispatch/reporter/console";
import { IIngress, Ingress } from "../service/ingress";
import { IIntrospection, Introspection } from "../service/introspect";
import {
	IIntrospectionMixinHono,
	IntrospectionMixinHono,
} from "../service/introspect/mixin-hono";
import { ISignal, Signal } from "../service/signal";
import { ISignalProvider } from "../service/signal/base";
import { SignalProviderSlack } from "../service/signal/provider/slack";
import { ISnapshot, Snapshot } from "../service/snapshot";
import { ISnapshotDeferTarget } from "../service/snapshot/defer/base";
import {
	ISnapshotDeferIngest,
	SnapshotDeferIngest,
} from "../service/snapshot/defer/ingest";
import { SnapshotDeferTargetObjectStore } from "../service/snapshot/defer/object-store";
import { IVoucher, Voucher } from "../service/voucher";
import { isSome } from "../type/maybe";

export const container = createContainer({ defaultScope: Scope.Container });

container.register(ConfigProvider, {
	useFactory: () => configProvider(config),
});

const resolved = config();

container.register(IDeriveDerivableDevice, { useClass: DeriveDerivableDevice });

container.register(IDeriveDerivable, { useExisting: IDeriveDerivableDevice });
container.register(IDeriveDerivable, { useClass: DeriveDerivableSubject });
container.register(IDeriveDerivable, {
	useClass: DeriveDerivableSubmissionFaulty,
});
container.register(IDeriveDerivable, {
	useClass: DeriveDerivableMetaEntityStat,
});

container.register(IDatabaseDerived, {
	useFactory: () =>
		new Database("derived", resolved.database.path.derived, {
			staging: { path: resolved.database.path.staging, readOnly: true },
		}),
});
container.register(IDatabaseStaging, {
	useFactory: () => new Database("staging", resolved.database.path.staging, {}),
});
container.register(IDeriveDerived, {
	useFactory: () =>
		new Derive(
			container.resolve(IDatabaseDerived),
			container.resolveAll(IDeriveDerivable),
			container.resolve(IIntrospection),
			{ ignoreSchedule: resolved.derive.ignoreSchedule },
		),
});
container.register(IDispatch, { useClass: Dispatch });
container.register(IDispatchReporter, { useClass: DispatchReporterConsole });
container.register(IIngress, { useClass: Ingress });
container.register(IIntrospectionMixinHono, {
	useClass: IntrospectionMixinHono(Introspection),
});
container.register(IIntrospection, {
	useExisting: IIntrospectionMixinHono,
});
container.register(ISignal, { useClass: Signal });
container.register(ISignalProvider, { useClass: SignalProviderSlack });
container.register(ISnapshot, { useClass: Snapshot });
container.register(ISnapshotDeferIngest, { useClass: SnapshotDeferIngest });
container.register(IVoucher, { useClass: Voucher });

container.register(DatabaseSnapshotCoordinators, {
	useFactory: () => ({
		...(isSome(resolved.database.snapshot.destination.staging)
			? {
					staging: new DatabaseSnapshotCoordinator(
						container.resolve(IDatabaseStaging),
						container.resolve(ISnapshotDeferIngest),
						resolved.database.snapshot.destination.staging,
					),
				}
			: {}),
	}),
});

{
	const signingKey = resolved.vendor.slack.callback.signingKey;
	const botToken = resolved.vendor.slack.botToken;
	if (isSome(signingKey) && isSome(botToken)) {
		container.register(ICallbackVendorSlack, {
			useFactory: () =>
				new CallbackVendorSlack(
					{ signingKey, botToken },
					container.resolve(DatabaseSnapshotCoordinators),
				),
		});
	}
}

{
	const target = resolved.snapshot.defer.target;
	switch (target) {
		case SnapshotDeferTarget.None:
			break;
		case SnapshotDeferTarget.ObjectStore:
			container.register(ISnapshotDeferTarget, {
				useClass: SnapshotDeferTargetObjectStore,
			});
			break;
	}
}
