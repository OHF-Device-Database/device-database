import type { Hono } from "hono";

import { router as routerPortalSnapshot } from "../portal/snapshot";
import { paths } from "./base";
import { router as routerDatabaseSnapshot } from "./database-backup";
import { router as routerExplorer } from "./openapi-explorer";

export const build = (app: Hono) => {
	app.route("/openapi/explorer", routerExplorer());
	app.route("/portal/snapshot", routerPortalSnapshot());
	app.route(paths["database-snapshot"], routerDatabaseSnapshot());

	// redirect to snapshot portal for now
	app.get("/", async (c) => {
		return c.redirect(`/portal/snapshot`);
	});
};
