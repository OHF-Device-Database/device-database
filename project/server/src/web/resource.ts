import { join, relative } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basePath } from "hono/route";

export const router = () => {
	const router = new Hono();

	router.use(
		"*",
		serveStatic({
			// `./resource` directory is copied over during build
			root: relative(".", join(import.meta.dirname, "resource")),
			rewriteRequestPath: (path, c) => {
				return path.slice(basePath(c).length);
			},
		}),
	);

	return router;
};
