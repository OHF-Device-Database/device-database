import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ModuleDatabase } from "./database.module";
import { ServiceDatabaseCoordinator } from "./database-coordinator.service";

@Module({
	imports: [ModuleConfig, ModuleDatabase],
	providers: [ServiceDatabaseCoordinator],
})
export class ModuleDatabaseCoordinator {}
