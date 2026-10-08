import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../../database/database.module";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./submission.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledCompactionOrphanedSubmission],
	exports: [ServiceSchedulerScheduledCompactionOrphanedSubmission],
})
export class ModuleSchedulerScheduledCompactionOrphanedSubmission {}
