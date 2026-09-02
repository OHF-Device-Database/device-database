import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../database/database.module";
import { ControllerHealth } from "./health.controller";
import { ServiceHealth } from "./health.service";

@Module({
	imports: [ModuleDatabase],
	controllers: [ControllerHealth],
	providers: [ServiceHealth],
})
export class ModuleHealth {}
