import { Module } from "@nestjs/common";

import { ModuleConfig } from "../../config/config.module";
import { ModuleLockfileCoordinator } from "../../database/lockfile-corrdinator.module";
import { ModuleSnapshotDeferIngest } from "./ingest.module";
import { ServiceSnapshotDeferIngestCoordinator } from "./ingest-coordinator.service";

@Module({
	imports: [ModuleConfig, ModuleSnapshotDeferIngest, ModuleLockfileCoordinator],
	providers: [ServiceSnapshotDeferIngestCoordinator],
	exports: [ServiceSnapshotDeferIngestCoordinator],
})
export class ModuleSnapshotDeferIngestCoordinator {}
