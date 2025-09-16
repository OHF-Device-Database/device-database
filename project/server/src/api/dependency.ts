import type { Hono } from "hono";

import { container } from "../dependency";
import { ISnapshot } from "../service/snapshot";

import type { DecoratedHandler } from "./base";

export type Dependency = {
	snapshot: ISnapshot;
};
const dependency: Dependency = {
	snapshot: container.resolve(ISnapshot),
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

		handlers[primed.for.path] = {
			...handlers[primed.for.path],
			[primed.for.method]: primed.for.handler,
		};

		routers.push(primed.router);
	}

	return { routers, handlers };
};

type UndeclaredHandler = (d: Dependency) => Hono;
export const primeUndeclaredRoute = (handler: UndeclaredHandler) => {
	return handler(dependency);
};
