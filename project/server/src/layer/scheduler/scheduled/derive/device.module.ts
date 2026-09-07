import { Module } from "@nestjs/common";

import { ModuleDatabase } from "../../../database/database.module";
import { ModuleIngress } from "../../../ingress/ingress.module";
import { ControllerSchedulerScheduledDeriveDevice } from "./device.controller";
import { ServiceSchedulerScheduledDeriveDevice } from "./device.service";

@Module({
	imports: [ModuleDatabase, ModuleIngress],
	providers: [ServiceSchedulerScheduledDeriveDevice],
	controllers: [ControllerSchedulerScheduledDeriveDevice],
	exports: [ServiceSchedulerScheduledDeriveDevice],
})
export class ModuleSchedulerScheduledDeriveDevice {}
