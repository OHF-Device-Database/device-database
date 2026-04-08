import type { Hono } from "hono";

import { paths } from "./base";
import { router as routerDatabaseSnapshot } from "./database/snapshot";
import { router as routerMetrics } from "./metrics";
import { router as routerExplorer } from "./openapi-explorer";
import { router as routerResource } from "./resource";

export const build = (app: Hono) => {
	app.route("/metrics", routerMetrics());
	app.route("/openapi/explorer", routerExplorer());
	app.route(paths["database-snapshot"], routerDatabaseSnapshot());
	app.route("/resource", routerResource());
};
