import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";
import { getAbsoluteFSPath } from "swagger-ui-dist";

import schema from "../../../schema.json" with { type: "json" };

import type { Maybe } from "../../../type/maybe";

/** mount point of the explorer, the paths it serves are relative to */
export const EXPLORER_PATH = "openapi/explorer";

/** only extensions encountered in static `swagger-ui-dist` files */
const CONTENT_TYPE: Readonly<Record<string, string>> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".txt": "text/plain; charset=utf-8",
};
const CONTENT_TYPE_FALLBACK = "application/octet-stream";

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

/** a file of the bundled explorer distribution, opened for reading */
type Asset = {
	readonly stream: Readable;
	readonly contentType: string;
	readonly length: number;
};

@Injectable()
export class ServiceOpenapiExplorer {
	/** directory that `swagger-ui-dist` assets are kept in */
	private static readonly root: string = resolve(getAbsoluteFSPath());

	/** own schema definition, served next to the distribution */
	public readonly schema = schema;

	/**
	 * `swagger-initializer.js` with substituted schema url
	 *
	 * @param mountedAt path the explorer is served under, without trailing slash
	 */
	initializer(mountedAt: string): string {
		return initializer(`${mountedAt}/schema.json`);
	}

	/**
	 * opens an asset of the distribution
	 *
	 * @param name file name
	 */
	async asset(name: string): Promise<Maybe<Asset>> {
		const path = join(ServiceOpenapiExplorer.root, name);
		// ensure directory can't be escaped
		if (dirname(path) !== ServiceOpenapiExplorer.root) {
			return null;
		}

		// anything that is not a readable file is indistinguishable from an absent one
		const stats = await stat(path).catch(() => null);
		if (stats === null || !stats.isFile()) {
			return null;
		}

		return {
			stream: createReadStream(path),
			contentType:
				CONTENT_TYPE[extname(path).toLowerCase()] ?? CONTENT_TYPE_FALLBACK,
			length: stats.size,
		};
	}
}
