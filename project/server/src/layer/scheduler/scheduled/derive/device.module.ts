import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../database/database.module";
import { ServiceSchedulerScheduledDeriveDevice } from "./device.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledDeriveDevice],
	exports: [ServiceSchedulerScheduledDeriveDevice],
})
export class ModuleSchedulerScheduledDeriveDevice {}
