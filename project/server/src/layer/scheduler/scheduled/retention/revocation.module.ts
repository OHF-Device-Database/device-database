import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../database/database.module";
import { ServiceSchedulerScheduledRetentionRevocation } from "./revocation.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledRetentionRevocation],
	exports: [ServiceSchedulerScheduledRetentionRevocation],
})
export class ModuleSchedulerScheduledRetentionRevocation {}
