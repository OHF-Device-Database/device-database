import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../database/database.module";
import { ServiceSchedulerScheduledDeriveSubject } from "./subject.service";

@Module({
	imports: [ModuleDatabase],
	providers: [ServiceSchedulerScheduledDeriveSubject],
	exports: [ServiceSchedulerScheduledDeriveSubject],
})
export class ModuleSchedulerScheduledDeriveSubject {}
