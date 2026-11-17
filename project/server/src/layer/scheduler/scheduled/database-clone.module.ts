import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../database/database.module";
import { ServiceSchedulerScheduledDatabaseClone } from "./database-clone.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledDatabaseClone],
	exports: [ServiceSchedulerScheduledDatabaseClone],
})
export class ModuleSchedulerScheduledDatabaseClone {}
