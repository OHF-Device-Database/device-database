import "reflect-metadata";

import type { ServerResponse } from "node:http";

import { NestFactory } from "@nestjs/core";

import { ModuleApp } from "./layer/app.module.js";
import { Config } from "./layer/config/config.module.js";
import { AdapterLogger } from "./layer/logging.js";

void (async () => {
	const app = await NestFactory.create(ModuleApp, {
		logger: new AdapterLogger(),
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
