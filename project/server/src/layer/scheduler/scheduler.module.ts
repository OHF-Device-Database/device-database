import { Module } from "@nestjs/common";

import { ModuleIntrospection } from "../introspection/introspection.module";
import { ModuleSchedulerScheduledCompactionOptimize } from "./scheduled/compaction/optimize.module";
import { ServiceSchedulerScheduledCompactionOptimize } from "./scheduled/compaction/optimize.service";
import { ModuleSchedulerScheduledCompactionOrphanedAttached } from "./scheduled/compaction/orphaned/attached.module";
import { ServiceSchedulerScheduledCompactionOrphanedAttached } from "./scheduled/compaction/orphaned/attached.service";
import { ModuleSchedulerScheduledCompactionOrphanedSubmission } from "./scheduled/compaction/orphaned/submission.module";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./scheduled/compaction/orphaned/submission.service";
import { ModuleSchedulerScheduledDatabaseClone } from "./scheduled/database-clone.module";
import { ServiceSchedulerScheduledDatabaseClone } from "./scheduled/database-clone.service";
import { ModuleSchedulerScheduledDeriveDevice } from "./scheduled/derive/device.module";
import { ServiceSchedulerScheduledDeriveDevice } from "./scheduled/derive/device.service";
import { ModuleSchedulerScheduledDeriveSubject } from "./scheduled/derive/subject.module";
import { ServiceSchedulerScheduledDeriveSubject } from "./scheduled/derive/subject.service";
import { ModuleSchedulerScheduledIndexExternalDcl } from "./scheduled/index/external-dcl.module";
import { ServiceSchedulerScheduledIndexExternalDcl } from "./scheduled/index/external-dcl.service";
import { ModuleSchedulerScheduledRetentionRevocation } from "./scheduled/retention/revocation.module";
import { ServiceSchedulerScheduledRetentionRevocation } from "./scheduled/retention/revocation.service";
import { SchedulerScheduled } from "./scheduler.registry";
import { ServiceScheduler } from "./scheduler.service";

import type { SchedulerScheduledInstance } from "../../service/scheduler/base";

@Module({
	imports: [
		ModuleIntrospection,
		ModuleSchedulerScheduledDeriveDevice,
		ModuleSchedulerScheduledDeriveSubject,
		ModuleSchedulerScheduledRetentionRevocation,
		ModuleSchedulerScheduledCompactionOrphanedSubmission,
		ModuleSchedulerScheduledCompactionOrphanedAttached,
		ModuleSchedulerScheduledCompactionOptimize,
		ModuleSchedulerScheduledDatabaseClone,
		ModuleSchedulerScheduledIndexExternalDcl,
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
				ServiceSchedulerScheduledRetentionRevocation,
				ServiceSchedulerScheduledCompactionOrphanedSubmission,
				ServiceSchedulerScheduledCompactionOrphanedAttached,
				ServiceSchedulerScheduledCompactionOptimize,
				ServiceSchedulerScheduledDatabaseClone,
				ServiceSchedulerScheduledIndexExternalDcl,
			],
		},
		ServiceScheduler,
	],
	exports: [ServiceScheduler],
})
export class ModuleScheduler {}
