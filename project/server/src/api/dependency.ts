import type { Hono } from "hono";

import { container } from "../dependency";
import { ICallbackVendorSlack } from "../service/callback/vendor/slack";
import { IDatabase } from "../service/database";
import { IIngress } from "../service/ingress";
import { IIntrospection } from "../service/introspect";
import { ISnapshot } from "../service/snapshot";
import { IVoucher } from "../service/voucher";

import type { DecoratedHandler } from "./base";

export type Dependency = {
	database: IDatabase;
	ingress: IIngress;
	introspection: IIntrospection;
	voucher: IVoucher;
	snapshot: ISnapshot;
	callback: {
		vendor: {
			slack: ICallbackVendorSlack | undefined;
		};
	};
};
const dependency: Dependency = {
	database: container.resolve(IDatabase),
	ingress: container.resolve(IIngress),
	introspection: container.resolve(IIntrospection),
	voucher: container.resolve(IVoucher),
	snapshot: container.resolve(ISnapshot),
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
