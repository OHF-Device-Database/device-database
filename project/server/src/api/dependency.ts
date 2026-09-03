import type { Hono } from "hono";

import { container } from "../dependency";
import { ICallbackVendorSlack } from "../service/callback/vendor/slack";
import { type IDatabase, IDatabaseStaging } from "../service/database";
import { ISchedulerScheduledDeriveDevice } from "../service/derive/derivable/device";
import { IIngress } from "../service/ingress";
import { IIntrospection } from "../service/introspect";
import { ISnapshot } from "../service/snapshot";
import { ISnapshotDeferTarget } from "../service/snapshot/defer/base";
import { IVoucher } from "../service/voucher";

import type { DecoratedHandler } from "./base";

export type Dependency = {
	database: {
		staging: IDatabase<"staging">;
	};
	derive: {
		device: ISchedulerScheduledDeriveDevice;
	};
	ingress: IIngress;
	introspection: IIntrospection;
	voucher: IVoucher;
	snapshot: {
		self: ISnapshot;
		deferTarget?: ISnapshotDeferTarget | undefined;
	};
	callback: {
		vendor: {
			slack: ICallbackVendorSlack | undefined;
		};
	};
};
const dependency: Dependency = {
	database: {
		staging: container.resolve(IDatabaseStaging),
	},
	derive: {
		device: container.resolve(ISchedulerScheduledDeriveDevice),
	},
	ingress: container.resolve(IIngress),
	introspection: container.resolve(IIntrospection),
	voucher: container.resolve(IVoucher),
	snapshot: {
		self: container.resolve(ISnapshot),
		deferTarget: container.resolve(ISnapshotDeferTarget, true),
	},
	callback: {
		vendor: {
			slack: container.resolve(ICallbackVendorSlack, true),
		},
	},
};

type Handler = (d: Dependency) => DecoratedHandler<unknown>;

export type Primed = {
	routers: Hono[];
};

export const primeRoutes = (...args: Handler[]): Primed => {
	const routers: Hono[] = [];
	for (const handler of args) {
		const primed = handler(dependency);
		routers.push(primed.router);
	}

	return { routers };
};
