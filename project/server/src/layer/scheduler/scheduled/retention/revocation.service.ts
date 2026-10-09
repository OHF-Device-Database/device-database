import { Inject, Injectable } from "@nestjs/common";
import { subDays } from "date-fns";
import type { PickDeep } from "type-fest";

import { deleteAttributionSubmissionFromRevokedSubjectByCutoff } from "../../../../service/database/query/staging/snapshot-delete";
import { floor } from "../../../../type/codec/integer";
import { Config } from "../../../config/config.module";
import { DatabaseStaging } from "../../../database/database.module";

import type { IDatabase } from "../../../../service/database";
import type { SchedulerScheduled } from "../../../../service/scheduler/base";

@Injectable()
export class ServiceSchedulerScheduledRetentionRevocation
	implements
		SchedulerScheduled<typeof ServiceSchedulerScheduledRetentionRevocation>
{
	static readonly id = Symbol("ServiceSchedulerScheduledRetentionRevocation");

	static readonly prerequisites = [];
	static readonly schedule = {
		minute: "0",
		hour: "15",
	} as const;

	constructor(
		@Inject(Config) private config: PickDeep<Config, "snapshot.revokeAfter">,
		@Inject(DatabaseStaging) private db: IDatabase<"staging">,
	) {}

	async run(): Promise<void> {
		const cutoff = subDays(new Date(), this.config.snapshot.revokeAfter);
		await this.db.run(
			deleteAttributionSubmissionFromRevokedSubjectByCutoff.bind.named({
				cutoff: floor(cutoff.getTime() / 1000),
			}),
			"background",
		);
	}
}
