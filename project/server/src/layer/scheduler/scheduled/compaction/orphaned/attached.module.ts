import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../../database/database.module";
import { ServiceSchedulerScheduledCompactionOrphanedAttached } from "./attached.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledCompactionOrphanedAttached],
	exports: [ServiceSchedulerScheduledCompactionOrphanedAttached],
})
export class ModuleSchedulerScheduledCompactionOrphanedAttached {}
