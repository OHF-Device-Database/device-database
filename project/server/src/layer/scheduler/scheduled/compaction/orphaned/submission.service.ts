import { Injectable } from "@nestjs/common";

import { deleteOrphanedSubmission } from "../../../../../service/database/query/staging/snapshot-delete";
import {
	ServiceSchedulerScheduledDatabaseClone,
	type ServiceSchedulerScheduledDatabaseCloneDescriptor,
} from "../../database-clone.service";
import {
	ServiceSchedulerScheduledRetentionRevocation,
	type ServiceSchedulerScheduledRetentionRevocationDescriptor,
} from "../../retention/revocation.service";

import type {
	SchedulerScheduled,
	SchedulerScheduledContext,
	SchedulerScheduledDescriptor,
} from "../../../../../service/scheduler/base";

@Injectable()
/** removes orphaned submissions and their attributions */
export class ServiceSchedulerScheduledCompactionOrphanedSubmission
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledCompactionOrphanedSubmission,
			ServiceSchedulerScheduledCompactionOrphanedSubmissionDescriptor,
			[
				ServiceSchedulerScheduledDatabaseCloneDescriptor,
				ServiceSchedulerScheduledRetentionRevocationDescriptor,
			]
		>
{
	static readonly id = Symbol(
		"ServiceSchedulerScheduledCompactionOrphanedSubmission",
	);

	static readonly prerequisites = [
		ServiceSchedulerScheduledDatabaseClone.id,
		ServiceSchedulerScheduledRetentionRevocation.id,
	] as const;

	async run(
		ctx: SchedulerScheduledContext<
			[ServiceSchedulerScheduledDatabaseCloneDescriptor]
		>,
	): Promise<void> {
		await ctx[ServiceSchedulerScheduledDatabaseClone.id].run(
			deleteOrphanedSubmission.bind.anonymous([]),
		);
	}
}

export type ServiceSchedulerScheduledCompactionOrphanedSubmissionDescriptor =
	SchedulerScheduledDescriptor<
		typeof ServiceSchedulerScheduledCompactionOrphanedSubmission.id,
		void
	>;
