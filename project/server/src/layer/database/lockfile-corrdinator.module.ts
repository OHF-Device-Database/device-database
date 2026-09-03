import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ModuleDatabase } from "./database.module";
import { ServiceLockfileCoordinator } from "./lockfile-coordinator.service";

@Module({
	imports: [ModuleConfig, ModuleDatabase],
	providers: [ServiceLockfileCoordinator],
	exports: [ServiceLockfileCoordinator],
})
export class ModuleLockfileCoordinator {}
