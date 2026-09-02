import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { ModuleApp } from "./layer/app.module.js";
import { Config } from "./layer/config/config.module.js";
import { AdapterLogger } from "./layer/logging.js";

void (async () => {
	const app = await NestFactory.create(ModuleApp, {
		logger: new AdapterLogger(),
	});
	app.enableShutdownHooks();
	const config: Config = await app.resolve(Config);
	await app.listen(config.port, config.host);
})();
