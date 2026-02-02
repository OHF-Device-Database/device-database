import type { Hono } from "hono";

import { paths } from "./base";
import { router as routerDatabaseSnapshotCurrent } from "./database/current";
import { router as routerMetrics } from "./metrics";
import { router as routerExplorer } from "./openapi-explorer";

export const build = (app: Hono) => {
	app.route("/metrics", routerMetrics());
	app.route("/openapi/explorer", routerExplorer());
	app.route(
		paths["database-snapshot-current"],
		routerDatabaseSnapshotCurrent(),
	);
};
