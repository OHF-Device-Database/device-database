import { join, relative } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { routePath } from "hono/route";

import { portalPath } from "..";

export const router = () => {
	const router = new Hono();

	const staticPath = "/*";
	const staticPathLength = staticPath.length;

	router.get("/", async (c) => {
		const route = routePath(c);
		return c.redirect(`${route.endsWith("/") ? route : `${route}/`}index.html`);
	});

	router.use(
		staticPath,
		serveStatic({
			// `serveStatic` expects relative paths
			root: relative(".", join(portalPath("snapshot"), "static")),
			rewriteRequestPath: (path, c) => {
				// `serveStatic` prepends mountpoint to every path
				// → use `routePath` to get mountpoint and consequently strip it away
				const route = routePath(c);

				// mountpoint also includes the `/*` portion
				return path.slice(route.length - staticPathLength);
			},
		}),
	);

	return router;
};
