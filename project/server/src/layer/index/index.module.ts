import { Module } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { isSome } from "../../type/maybe";
import { Config, ModuleConfig } from "../config/config.module";
import { ModuleDatabase } from "../database/database.module";
import { IndexForge } from "./forge/base";
import { ControllerIndexVendorGithub } from "./forge/github/github.controller";
import { IndexForgeGithub } from "./forge/github/github.service";
import { ServiceIndex } from "./index.service";

@Module({
	imports: [ModuleConfig, ModuleDatabase],
	controllers: [ControllerIndexVendorGithub],
	providers: [
		{
			provide: IndexForgeGithub,
			inject: [Config],
			useFactory: (c: PickDeep<Config, "index.github">) =>
				isSome(c.index.github) ? new IndexForgeGithub(c.index.github) : null,
		},
		{ provide: IndexForge, useExisting: IndexForgeGithub },
		ServiceIndex,
	],
	exports: [ServiceIndex],
})
export class ModuleIndex {}
