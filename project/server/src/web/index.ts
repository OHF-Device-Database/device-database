import type { Hono } from "hono";

import { paths } from "./base";
import { router as routerDatabaseSnapshot } from "./database-backup";
import { router as routerExplorer } from "./openapi-explorer";

export const build = (app: Hono) => {
	app.route("/openapi/explorer", routerExplorer());
	app.route(paths["database-snapshot"], routerDatabaseSnapshot());
};
