import { createServer, request, type ServerResponse } from "node:http";
import { dirname, join, parse } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Stats } from "node:fs";

import { typecheckPlugin } from "@jgoz/esbuild-plugin-typecheck";
import { lookup } from "mime-types";
import esbuild from "esbuild";
import type { BuildResult, Plugin } from "esbuild";
import { buildOptions } from "./build.config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATIC_DIR = "static";

const parsedServePort = parseInt(env.SERVE_PORT ?? "", 10);

// necessary because 0 is a valid port
const SERVE_PORT = Number.isNaN(parsedServePort) ? 8080 : parsedServePort;
const HOSTNAME = "localhost";

const stripPrefix = (prefixed: string) =>
	prefixed.slice(__dirname.length + 1 + STATIC_DIR.length + 1);

const clients: ServerResponse[] = [];

let result: BuildResult | undefined;

const watchServer = createServer((_, res) => {
	return clients.push(
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Access-Control-Allow-Origin": "*",
			Connection: "keep-alive",
		})
	);
}).listen(0);

const API_BASE_URL = env.API_BASE_URL
	? env.API_BASE_URL
	: `http://${HOSTNAME}:3000`;
const PARSED_API_BASE_URL = new URL(API_BASE_URL);

const outputFile = (outputFiles: esbuild.OutputFile[], name: string) => {
	for (const file of outputFiles) {
		// `esbuild` prefixes artifacts with the absolute path to the working directory
		const stripped = stripPrefix(file.path);
		if (stripped === name) {
			return file;
		}
	}

	return null;
};

const serveServer = createServer(async (req, res) => {
	const url = new URL(req.url!, `http://${req.headers.host}`);

	const path = url.pathname;
	const parsed = parse(path);

	// proxy requests to api to work around CORS
	if (parsed.dir.startsWith("/api/")) {
		const proxy = request(
			{
				hostname: PARSED_API_BASE_URL.hostname,
				port: PARSED_API_BASE_URL.port,
				path: req.url,
				method: req.method,
				headers: req.headers,
			},
			(proxied) => {
				if (typeof proxied.statusCode === "undefined") {
					return;
				}

				res.writeHead(proxied.statusCode, proxied.headers);
				proxied.pipe(res, { end: true });
			}
		);

		req.pipe(proxy);
		return;
	}

	// nuke CORS
	res.setHeader("access-control-allow-origin", "*");

	const staticPrefix = `/${STATIC_DIR}`;

	if (parsed.dir.startsWith(staticPrefix)) {
		const contentType = lookup(parsed.ext);
		if (!contentType) {
			console.error(`mime type unknown for extension "${parsed.ext}"`);
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("unsupported content type");
			return;
		}

		if (parsed.dir === staticPrefix) {
			const name = parsed.name + parsed.ext;
			const file = outputFile(result?.outputFiles ?? [], name);
			if (file !== null) {
				res.writeHead(200, {
					"Content-Type": contentType,
					"Content-Length": file.contents.byteLength,
				});
				res.write(file.contents);
				res.end();

				return;
			}
		}

		// serve directly from public folder as fallback
		// mostly for favicons, as there isn't an easy way to include static assets in `outputFiles`
		fallback: {
			const resolved = join("public", path.slice(staticPrefix.length));

			let stats: Stats;
			try {
				stats = await stat(resolved);
			} catch {
				break fallback;
			}

			if (!stats.isFile()) {
				break fallback;
			}

			const content = await readFile(resolved);
			res.writeHead(200, {
				"Content-Type": contentType,
				"Content-Length": content.length,
			});
			res.write(content);
			res.end();

			return;
		}

		res.writeHead(404);
		res.end("not found");
	} else {
		const errors = result?.errors ?? [];
		const warnings = result?.warnings ?? [];

		const root =
			errors.length > 0
				? `<pre>${errors.map((item) => JSON.stringify(item)).join("\n")}</pre>`
				: `<style>html, body { margin: 0; height: 100%; }</style>
				<element-entrypoint></element-entrypoint>
        <script type="module" src="/${STATIC_DIR}/entrypoint.js"></script>`;

		const data = `
<!DOCTYPE html>
<html lang="en-US">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
</head>

<body>
${root}

<script>
(() => new EventSource("http://localhost:${watchPort}").onmessage = () => location.reload())();
</script>
<script>
${JSON.stringify(warnings)}.forEach((m) => console.warning(m))
</script>

</body>

</html>
    `;

		res.writeHead(200);
		res.end(data);
	}
}).listen(SERVE_PORT);

const watchPort = (watchServer.address() as AddressInfo).port;
const servePort = (serveServer.address() as AddressInfo).port;

const SERVE_URL = env.SERVE_URL || `http://${HOSTNAME}:${servePort}`;

const sentinelPlugin: Plugin = {
	name: "sentinel",
	setup: (build) => {
		build.onEnd(() => {
			for (const client of clients) {
				client.write("data: update\n\n");
			}
		});
	},
};

(async () => {
	const context = await esbuild.context({
		...buildOptions,
		logLevel: "info",
		platform: "browser",
		minify: false,
		publicPath: `${SERVE_URL}/${STATIC_DIR}`,
		outdir: STATIC_DIR,
		write: false,
		define: {
			API_BASE_URL: `"${SERVE_URL}"`,
			SSR: "false",
			ARTIFACT: '"watch"',
		},
		plugins: [
			...buildOptions.plugins,
			typecheckPlugin({ omitStartLog: true, watch: true }),
			sentinelPlugin,
		],
	});

	// initial build
	result = await context.rebuild();

	console.log(`[watch] running on: ${SERVE_URL}`);

	// enable watch mode
	await context.watch();
})();
