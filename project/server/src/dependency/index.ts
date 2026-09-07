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
import { bake } from "../service/database/base";
import { Dispatch, IDispatch } from "../service/dispatch";
import { IDispatchReporter } from "../service/dispatch/base";
import { DispatchReporterConsole } from "../service/dispatch/reporter/console";
import { IIngress, Ingress } from "../service/ingress";
import { IIntrospection, Introspection } from "../service/introspect";
import {
	IIntrospectionMixinHono,
	IntrospectionMixinHono,
} from "../service/introspect/mixin-hono";
import { IScheduler, Scheduler } from "../service/scheduler";
import { ISchedulerScheduled } from "../service/scheduler/base";
import {
	ISchedulerScheduledDeriveDevice,
	SchedulerScheduledDeriveDevice,
} from "../service/scheduler/scheduled/derive/device";
import { SchedulerScheduledDeriveSubject } from "../service/scheduler/scheduled/derive/subject";
import { SchedulerScheduledDeriveSubmissionFaulty } from "../service/scheduler/scheduled/derive/submission";
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

const maybeURL = (s: string) => {
	try {
		return new URL(s);
	} catch {
		return s;
	}
};

container.register(ConfigProvider, {
	useFactory: () => configProvider(config),
});

const resolved = config();

container.register(ISchedulerScheduledDeriveDevice, {
	useClass: SchedulerScheduledDeriveDevice,
});

container.register(ISchedulerScheduled, {
	useExisting: ISchedulerScheduledDeriveDevice,
});
container.register(ISchedulerScheduled, {
	useClass: SchedulerScheduledDeriveSubject,
});
container.register(ISchedulerScheduled, {
	useClass: SchedulerScheduledDeriveSubmissionFaulty,
});

container.register(IDatabaseDerived, {
	useFactory: () =>
		new Database(
			"derived",
			bake({ location: maybeURL(resolved.database.path.derived) }),
			{
				staging: bake({
					location: maybeURL(resolved.database.path.staging),
					readOnly: true,
				}),
			},
		),
});
container.register(IDatabaseStaging, {
	useFactory: () =>
		new Database(
			"staging",
			bake({ location: maybeURL(resolved.database.path.staging) }),
			{},
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
container.register(ISnapshot, { useClass: Snapshot });
container.register(ISnapshotDeferIngest, { useClass: SnapshotDeferIngest });
container.register(IVoucher, { useClass: Voucher });

if (resolved.scheduler.enable) {
	container.register(IScheduler, {
		useFactory: () =>
			new Scheduler(
				container.resolveAll(ISchedulerScheduled),
				container.resolve(IIntrospection),
			),
	});
}

{
	const slack = resolved.vendor.slack;
	if (isSome(slack)) {
		const {
			callback: { signingKey },
			botToken,
		} = slack;

		container.register(ICallbackVendorSlack, {
			useFactory: () => new CallbackVendorSlack({ signingKey, botToken }),
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
