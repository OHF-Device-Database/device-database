import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../database/database.module";
import { ServiceSchedulerScheduledCompactionOptimize } from "./optimize.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledCompactionOptimize],
	exports: [ServiceSchedulerScheduledCompactionOptimize],
})
export class ModuleSchedulerScheduledCompactionOptimize {}
