import { Module } from "@nestjs/common";

import { ModuleIntrospection } from "../introspection/introspection.module";
import { ModuleSchedulerScheduledDeriveDevice } from "./scheduled/derive/device.module";
import { ServiceSchedulerScheduledDeriveDevice } from "./scheduled/derive/device.service";
import { ModuleSchedulerScheduledDeriveSubject } from "./scheduled/derive/subject.module";
import { ServiceSchedulerScheduledDeriveSubject } from "./scheduled/derive/subject.service";
import { SchedulerScheduled } from "./scheduler.registry";
import { ServiceScheduler } from "./scheduler.service";

import type { SchedulerScheduledInstance } from "../../service/scheduler/base";

@Module({
	imports: [
		ModuleIntrospection,
		ModuleSchedulerScheduledDeriveDevice,
		ModuleSchedulerScheduledDeriveSubject,
	],
	providers: [
		{
			provide: SchedulerScheduled,
			useFactory: (
				...units: SchedulerScheduledInstance[]
			): SchedulerScheduled => units,
			inject: [
				ServiceSchedulerScheduledDeriveDevice,
				ServiceSchedulerScheduledDeriveSubject,
			],
		},
		ServiceScheduler,
	],
	exports: [ServiceScheduler],
})
export class ModuleScheduler {}
