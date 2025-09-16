import { createMiddleware } from "hono/factory";

import { RequestStorage, requestStorage } from "../../utility/request-storage";

export const MiddlewareRequestStorageDomain = Symbol(
	"MiddlewareRequestStorageDomain",
);

export type MiddlewareRequestStorageVariables = {
	requestId: string;
};

/**
 * injects hono's request identifier into async local storage
 * allows logging machinery to attach request identifier when called from a request handler
 */
export const middlewareRequestStorage = createMiddleware<{
	Variables: MiddlewareRequestStorageVariables;
}>(async (c, next) => {
	const store = new RequestStorage();
	await requestStorage.run(store, async () => {
		const scope = store.scope(MiddlewareRequestStorageDomain);
		scope.set(c.var.requestId);

		await next();
	});
});
