import { Module } from "@nestjs/common";

import { ModuleLockfileCoordinator } from "../database/lockfile-corrdinator.module";
import { ModuleSnapshotDeferIngest } from "../snapshot/defer/ingest.module";
import { ModuleScheduler } from "./scheduler.module";
import { ServiceSchedulerCoordinator } from "./scheduler-coordinator.service";

@Module({
	imports: [
		ModuleLockfileCoordinator,
		ModuleScheduler,
		ModuleSnapshotDeferIngest,
	],
	providers: [ServiceSchedulerCoordinator],
	exports: [ServiceSchedulerCoordinator],
})
export class ModuleSchedulerCoordinator {}
