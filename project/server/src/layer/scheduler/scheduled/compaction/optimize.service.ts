import { Inject, Injectable } from "@nestjs/common";

import { DatabaseStaging } from "../../../database/database.module";
import {
	ServiceSchedulerScheduledDatabaseClone,
	type ServiceSchedulerScheduledDatabaseCloneDescriptor,
} from "../database-clone.service";
import {
	ServiceSchedulerScheduledRetentionRevocation,
	type ServiceSchedulerScheduledRetentionRevocationDescriptor,
} from "../retention/revocation.service";
import {
	ServiceSchedulerScheduledCompactionOrphanedAttached,
	type ServiceSchedulerScheduledCompactionOrphanedAttachedDescriptor,
} from "./orphaned/attached.service";
import {
	ServiceSchedulerScheduledCompactionOrphanedSubmission,
	type ServiceSchedulerScheduledCompactionOrphanedSubmissionDescriptor,
} from "./orphaned/submission.service";

import type { IDatabaseSwappable } from "../../../../service/database";
import type {
	SchedulerScheduled,
	SchedulerScheduledContext,
	SchedulerScheduledDescriptor,
} from "../../../../service/scheduler/base";

@Injectable()
export class ServiceSchedulerScheduledCompactionOptimize
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledCompactionOptimize,
			ServiceSchedulerScheduledCompactionOptimizeDescriptor,
			[
				ServiceSchedulerScheduledDatabaseCloneDescriptor,
				ServiceSchedulerScheduledRetentionRevocationDescriptor,
				ServiceSchedulerScheduledCompactionOrphanedSubmissionDescriptor,
				ServiceSchedulerScheduledCompactionOrphanedAttachedDescriptor,
			]
		>
{
	static readonly id = Symbol("ServiceSchedulerScheduledCompactionOptimize");

	static readonly prerequisites = [
		ServiceSchedulerScheduledDatabaseClone.id,
		ServiceSchedulerScheduledRetentionRevocation.id,
		ServiceSchedulerScheduledCompactionOrphanedSubmission.id,
		ServiceSchedulerScheduledCompactionOrphanedAttached.id,
	] as const;
	static readonly schedule = {
		minute: "0",
		hour: "15",
	} as const;

	constructor(
		@Inject(DatabaseStaging) private db: IDatabaseSwappable<"staging">,
	) {}

	async run(
		ctx: SchedulerScheduledContext<
			[ServiceSchedulerScheduledDatabaseCloneDescriptor]
		>,
	): Promise<void> {
		await ctx[ServiceSchedulerScheduledDatabaseClone.id].run({
			query: "vacuum;",
			name: "Vacuum",
			parameters: [],
			database: "staging",
			connectionMode: "w",
			integerMode: "number",
			resultMode: "one",
			rowMode: "object",
		});

		await ctx[ServiceSchedulerScheduledDatabaseClone.id].run({
			query: "analyze;",
			name: "Analyze",
			parameters: [],
			database: "staging",
			connectionMode: "w",
			integerMode: "number",
			resultMode: "one",
			rowMode: "object",
		});

		await this.db.swap(ctx[ServiceSchedulerScheduledDatabaseClone.id]);
	}
}

export type ServiceSchedulerScheduledCompactionOptimizeDescriptor =
	SchedulerScheduledDescriptor<
		typeof ServiceSchedulerScheduledCompactionOptimize.id,
		void
	>;
