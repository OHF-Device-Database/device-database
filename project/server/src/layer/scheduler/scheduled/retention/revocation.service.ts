import { Inject, Injectable } from "@nestjs/common";
import { subDays } from "date-fns";
import type { PickDeep } from "type-fest";

import { deleteAttributionSubmissionFromRevokedSubjectByCutoff } from "../../../../service/database/query/staging/snapshot-delete";
import { floor } from "../../../../type/codec/integer";
import { Config } from "../../../config/config.module";
import {
	ServiceSchedulerScheduledDatabaseClone,
	type ServiceSchedulerScheduledDatabaseCloneDescriptor,
} from "../database-clone.service";

import type {
	SchedulerScheduled,
	SchedulerScheduledContext,
	SchedulerScheduledDescriptor,
} from "../../../../service/scheduler/base";

@Injectable()
export class ServiceSchedulerScheduledRetentionRevocation
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledRetentionRevocation,
			ServiceSchedulerScheduledRetentionRevocationDescriptor,
			[ServiceSchedulerScheduledDatabaseCloneDescriptor]
		>
{
	static readonly id = Symbol("ServiceSchedulerScheduledRetentionRevocation");

	static readonly prerequisites = [
		ServiceSchedulerScheduledDatabaseClone.id,
	] as const;

	constructor(
		@Inject(Config) private config: PickDeep<Config, "snapshot.revokeAfter">,
	) {}

	async run(
		ctx: SchedulerScheduledContext<
			[ServiceSchedulerScheduledDatabaseCloneDescriptor]
		>,
	): Promise<void> {
		const cutoff = subDays(new Date(), this.config.snapshot.revokeAfter);
		await ctx[ServiceSchedulerScheduledDatabaseClone.id].run(
			deleteAttributionSubmissionFromRevokedSubjectByCutoff.bind.named({
				cutoff: floor(cutoff.getTime() / 1000),
			}),
		);
	}
}
export type ServiceSchedulerScheduledRetentionRevocationDescriptor =
	SchedulerScheduledDescriptor<
		typeof ServiceSchedulerScheduledRetentionRevocation.id,
		void
	>;
