import { relative } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { routePath } from "hono/route";
import { getAbsoluteFSPath } from "swagger-ui-dist";

import schema from "../schema.json";

// `swagger-ui-dist` ships a hardcoded config at `/swagger-initializer.js`
// serve a customized version instead that points at own schema definition
const initializer = (schemaUrl: string) => `window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: ${JSON.stringify(schemaUrl)},
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    layout: "StandaloneLayout"
  });
};`;

export const router = () => {
	const router = new Hono();

	const schemaPath = "/schema.json";

	const initializerPath = "/swagger-initializer.js";
	const initializerPathLength = initializerPath.length;

	const staticPath = "/*";
	const staticPathLength = staticPath.length;

	router.get(schemaPath, (c) => {
		return c.json(schema);
	});

	router.get(initializerPath, (c) => {
		const route = routePath(c);
		const mountedAt = route.slice(0, route.length - initializerPathLength);

		const initialized = initializer(`${mountedAt}/schema.json`);

		c.header("Content-Type", "text/javascript");
		return c.body(initialized);
	});

	router.get("/", async (c) => {
		const route = routePath(c);
		return c.redirect(`${route.endsWith("/") ? route : `${route}/`}index.html`);
	});

	router.use(
		staticPath,
		serveStatic({
			// `serveStatic` expects relative paths
			root: relative(".", getAbsoluteFSPath()),
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
