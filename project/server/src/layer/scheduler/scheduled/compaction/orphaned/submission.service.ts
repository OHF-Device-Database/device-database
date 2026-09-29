import { Inject, Injectable } from "@nestjs/common";

import { deleteOrphanedSubmission } from "../../../../../service/database/query/staging/snapshot-delete";
import { DatabaseStaging } from "../../../../database/database.module";
import { ServiceSchedulerScheduledRetentionRevocation } from "../../retention/revocation.service";

import type { IDatabase } from "../../../../../service/database";
import type { SchedulerScheduled } from "../../../../../service/scheduler/base";

@Injectable()
/** removes orphaned submissions and their attributions */
export class ServiceSchedulerScheduledCompactionOrphanedSubmission
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledCompactionOrphanedSubmission
		>
{
	static readonly id = Symbol(
		"ServiceSchedulerScheduledCompactionOrphanedSubmission",
	);

	static readonly prerequisites = [
		ServiceSchedulerScheduledRetentionRevocation.id,
	];

	constructor(@Inject(DatabaseStaging) private db: IDatabase<"staging">) {}

	async run(): Promise<void> {
		await this.db.begin("w", async (t) => {
			await t.run(deleteOrphanedSubmission.bind.anonymous([]));
		});
	}
}
