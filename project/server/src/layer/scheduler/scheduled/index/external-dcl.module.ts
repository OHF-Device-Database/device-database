import { Module } from "@nestjs/common";

import { ModuleIndexExternalDcl } from "../../../index/external/dcl/dcl.module";
import { ServiceSchedulerScheduledIndexExternalDcl } from "./external-dcl.service";

@Module({
	imports: [ModuleIndexExternalDcl],
	providers: [ServiceSchedulerScheduledIndexExternalDcl],
	exports: [ServiceSchedulerScheduledIndexExternalDcl],
})
export class ModuleSchedulerScheduledIndexExternalDcl {}
