import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";

import callbackVendorSlack from "./endpoint/callback/vendor/slack";
import health from "./endpoint/health/index";
import { middlewareRequestLog } from "./middleware/request-log";
import { middlewareRequestStorage } from "./middleware/request-storage";

import type { DecoratedRoutes, HandlerMap } from "./dependency";

export const build = (app: Hono, settings: { cors: boolean }) => {
	let handlers: HandlerMap = {};
	const use = (decorated: DecoratedRoutes) => {
		for (const router of decorated.routers) {
			app.route("/", router);
		}
		handlers = { ...handlers, ...decorated.handlers };
	};

	app.use(requestId());
	app.use(middlewareRequestLog);
	app.use(middlewareRequestStorage);
	if (settings.cors) {
		app.use(cors());
	}
	app.use(etag());
	app.use(
		bodyLimit({
			// 2048kb
			maxSize: 2048 * 1024,
		}),
	);

	use(callbackVendorSlack);
	use(health);

	return handlers;
};
