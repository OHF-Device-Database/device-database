import { Global, Module } from "@nestjs/common";

import { config } from "../../config";

export const Config = Symbol("Config");
export type Config = ReturnType<typeof config>;

@Global()
@Module({
	providers: [
		{
			provide: Config,
			useFactory: () => config(),
		},
	],
	exports: [Config],
})
export class ModuleConfig {}
