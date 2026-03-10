import type { Hono } from "hono";

import { container } from "../dependency";
import { ICallbackVendorSlack } from "../service/callback/vendor/slack";
import { type IDatabase, IDatabaseStaging } from "../service/database";
import { IDeriveDerivableDevice } from "../service/derive/derivable/device";
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
	derivable: {
		device: IDeriveDerivableDevice;
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
	derivable: {
		device: container.resolve(IDeriveDerivableDevice),
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

// {"<route>": {"<method>": <handler>}}
export type HandlerMap = Record<string, Record<string, unknown>>;

export type DecoratedRoutes = {
	routers: Hono[];
	handlers: HandlerMap;
};

export const primeRoutes = (...args: Handler[]): DecoratedRoutes => {
	const handlers: HandlerMap = {};
	const routers: Hono[] = [];

	for (const handler of args) {
		const primed = handler(dependency);

		routers.push(primed.router);

		// TODO: sink endpoints are unsupported for now
		if (typeof primed.for === "undefined") {
			continue;
		}

		handlers[primed.for.path] = {
			...handlers[primed.for.path],
			[primed.for.method]: primed.for.handler,
		};
	}

	return { routers, handlers };
};

type UndeclaredHandler = (d: Dependency) => Hono;
export const primeUndeclaredRoute = (handler: UndeclaredHandler) => {
	return handler(dependency);
};
