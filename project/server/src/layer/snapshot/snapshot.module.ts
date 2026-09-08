import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ModuleDatabase } from "../database/database.module";
import { ModuleIntrospection } from "../introspection/introspection.module";
import { ModuleVoucher } from "../voucher/voucher.module";
import { ControllerSnapshot } from "./snapshot.controller";
import { ServiceSnapshot } from "./snapshot.service";

@Module({
	imports: [ModuleConfig, ModuleDatabase, ModuleIntrospection, ModuleVoucher],
	controllers: [ControllerSnapshot],
	providers: [ServiceSnapshot],
	exports: [ServiceSnapshot],
})
export class ModuleSnapshot {}
