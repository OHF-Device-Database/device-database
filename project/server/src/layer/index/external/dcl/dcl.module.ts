import { Module } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { Config, ModuleConfig } from "../../../config/config.module";
import { ModuleDatabase } from "../../../database/database.module";
import { IndexExternalDcl } from "./dcl.client";
import { ServiceIndexExternalDcl } from "./dcl.service";

@Module({
	imports: [ModuleConfig, ModuleDatabase],
	providers: [
		{
			provide: IndexExternalDcl,
			inject: [Config],
			useFactory: (c: PickDeep<Config, "index.dcl">) =>
				c.index.dcl.enable ? new IndexExternalDcl(c.index.dcl) : null,
		},
		ServiceIndexExternalDcl,
	],
	exports: [ServiceIndexExternalDcl],
})
export class ModuleIndexExternalDcl {}
