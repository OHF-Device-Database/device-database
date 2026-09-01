import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import callbackVendorSlack from "./endpoint/callback/vendor/slack";
import derived from "./endpoint/derived";
import dimension from "./endpoint/dimension";
import health from "./endpoint/health";
import snapshot from "./endpoint/snapshot";
import { middlewareRequestLog } from "./middleware/request-log";
import { middlewareRequestStorage } from "./middleware/request-storage";

import type { Primed } from "./dependency";

export const build = (
	app: Hono,
	settings: {
		cors: boolean;
	},
) => {
	const use = (decorated: Primed) => {
		for (const router of decorated.routers) {
			app.route("/", router);
		}
	};

	app.use(requestId());
	app.use(middlewareRequestLog);
	app.use(middlewareRequestStorage);
	if (settings.cors) {
		app.use(cors());
	}
	app.use(
		bodyLimit({
			// 5120kb
			maxSize: 5120 * 1024,
		}),
	);

	use(callbackVendorSlack);
	use(derived);
	use(dimension);
	use(health);
	use(snapshot);
};
