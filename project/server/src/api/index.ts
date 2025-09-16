import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";

import { router as routerPortalSnapshot } from "../portal/snapshot";
import health from "./endpoint/health/index";
import snapshot from "./endpoint/snapshot/index";
import { middlewareRequestLog } from "./middleware/request-log";
import { middlewareRequestStorage } from "./middleware/request-storage";
import { router as routerExplorer } from "./openapi-explorer";

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
			// 1024kb
			maxSize: 1024 * 1024,
		}),
	);

	use(health);
	use(snapshot);

	app.route("/openapi/explorer", routerExplorer());
	app.route("/portal/snapshot", routerPortalSnapshot());

	// redirect to snapshot portal for now
	app.get("/", async (c) => {
		return c.redirect(`/portal/snapshot`);
	});

	return handlers;
};
