import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Readable } from "node:stream";

import { serveStatic } from "@hono/node-server/serve-static";
import { renderModule } from "@lit-labs/ssr/lib/render-module.js";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable.js";
import type { Hono } from "hono";
import { stream } from "hono/streaming";

const __dirname = import.meta.dirname;

export const build = async (app: Hono) => {
	const csrPath = join(__dirname, "..", "client-csr");

	const staticPath = "/static/*";
	const staticPathLength = staticPath.length;

	app.use(
		staticPath,
		serveStatic({
			// `serveStatic` expects relative paths
			root: relative(".", csrPath),
			rewriteRequestPath: (path) => {
				// mountpoint also includes the `/*` portion
				return path.slice(staticPathLength - 2);
			},
		}),
	);

	const csrEntrypointPath = join(csrPath, "entrypoint.js");
	const csrEntrypoint = await readFile(csrEntrypointPath, "utf8");

	let csrEntrypointHash;
	{
		const hash = createHash("sha256");
		hash.update(csrEntrypoint);

		csrEntrypointHash = hash.digest("hex");
	}

	// for cache-busting
	const csrEntrypointAliasPath = `/static/entrypoint-${csrEntrypointHash.slice(0, 8)}.js`;

	app.get(csrEntrypointAliasPath, (c) => {
		c.header("Content-Type", "text/javascript");
		return c.body(csrEntrypoint);
	});

	// `serveStatic` calls `next` when a path isn't found → register handler on same path that returns 404
	app.get(staticPath, (c) => {
		return c.notFound();
	});

	app.get("/*", (c) => {
		return stream(c, async (stream) => {
			const rendered = await renderModule(
				"./ssr-render-entrypoint.mjs",
				import.meta.url,
				"entrypoint",
				[{ "entrypoint-js": csrEntrypointAliasPath }],
			);

			c.header("Content-Type", "text/html");

			await stream.pipe(Readable.toWeb(new RenderResultReadable(rendered)));
		});
	});
};
