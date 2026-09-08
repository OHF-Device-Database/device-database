import "reflect-metadata";

import type { IncomingMessage, ServerResponse } from "node:http";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { ModuleApp } from "./layer/app.module.js";
import {
	REQUEST_BODY_LIMIT,
	streamedRouteMatcher,
	streamedRoutes,
} from "./layer/body.js";
import { Config } from "./layer/config/config.module.js";
import { AdapterLogger } from "./layer/logging.js";

void (async () => {
	const app = await NestFactory.create<NestExpressApplication>(ModuleApp, {
		logger: new AdapterLogger(),
		rawBody: true,
		// registered below, so that `@StreamedBody` routes can opt out of parsing
		bodyParser: false,
	});

	// bodies the parser is kept away from are capped by `InterceptorRouteBody` instead
	const streamed = streamedRouteMatcher(streamedRoutes(app));
	// overriding `type` replaces the parser's own matching, so the urlencoded
	// route has to be kept out of it → matched as strictly as clients send it
	app.useBodyParser("json", {
		limit: REQUEST_BODY_LIMIT,
		type: (request: IncomingMessage) =>
			!streamed(request) &&
			request.headers["content-type"] === "application/json",
	});
	app.useBodyParser("urlencoded", {
		extended: true,
		limit: REQUEST_BODY_LIMIT,
	});

	// adapters may advertise themselves (e.g. express sends `x-powered-by`)
	// → platform-neutral way of stripping header
	app.use((_: unknown, response: ServerResponse, next: () => void) => {
		response.removeHeader("x-powered-by");
		next();
	});
	app.enableShutdownHooks();
	const config: Config = await app.resolve(Config);
	await app.listen(config.port, config.host);
})();
