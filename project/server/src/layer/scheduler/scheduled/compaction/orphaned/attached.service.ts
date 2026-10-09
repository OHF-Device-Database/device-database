import { Inject, Injectable } from "@nestjs/common";

import { logger as parentLogger } from "../../../../../logger";
import {
	deleteOrphanedDevice,
	deleteOrphanedDevicePermutation,
	deleteOrphanedDevicePermutationLink,
	deleteOrphanedEntity,
	deleteOrphanedEntitySet,
	deleteOrphanedEntitySetContent,
} from "../../../../../service/database/query/staging/snapshot-delete";
import { formatNs } from "../../../../../utility/format";
import { timed } from "../../../../../utility/timed";
import { DatabaseStaging } from "../../../../database/database.module";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./submission.service";

import type { IDatabase } from "../../../../../service/database";
import type { SchedulerScheduled } from "../../../../../service/scheduler/base";

const logger = parentLogger.child({
	label: "scheduler-scheduled-compaction-orphaned-attached",
});

@Injectable()
/** required in addition to {@link ServiceSchedulerScheduledCompactionOrphanedSubmission}
 * the former deletes submissions and accompanying attributions, but not actual devices / device permutations / entities that have become orphaned */
export class ServiceSchedulerScheduledCompactionOrphanedAttached
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledCompactionOrphanedAttached
		>
{
	static readonly id = Symbol(
		"ServiceSchedulerScheduledCompactionOrphanedAttached",
	);

	static readonly prerequisites = [
		ServiceSchedulerScheduledCompactionOrphanedSubmission.id,
	];

	constructor(@Inject(DatabaseStaging) private db: IDatabase<"staging">) {}

	async run(): Promise<void> {
		await this.db.begin(
			"w",
			async (t) => {
				// run before device permutation deletion to prevent expensive cascading deletes
				{
					const took = await timed(() =>
						t.run(deleteOrphanedEntitySetContent.bind.anonymous([])),
					);
					logger.info(`pruned set entity content in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_set_content_entity_device_permutation",
					});
				}

				{
					const took = await timed(() =>
						t.run(deleteOrphanedEntitySet.bind.anonymous([])),
					);
					logger.info(`pruned set entity descriptors in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_set_entity_device_permutation",
					});
				}

				{
					const took = await timed(() =>
						t.run(deleteOrphanedEntity.bind.anonymous([])),
					);
					logger.info(`pruned entities in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_entity",
					});
				}

				{
					const took = await timed(() =>
						t.run(deleteOrphanedDevicePermutationLink.bind.anonymous([])),
					);
					logger.info(`pruned device permutation links in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_device_permutation_link",
					});
				}

				{
					const took = await timed(() =>
						t.run(deleteOrphanedDevicePermutation.bind.anonymous([])),
					);
					logger.info(`pruned device permutations in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_device_permutation",
					});
				}

				{
					const took = await timed(() =>
						t.run(deleteOrphanedDevice.bind.anonymous([])),
					);
					logger.info(`pruned devices in ${formatNs(took)}s`, {
						took,
						table: "snapshot_submission_device",
					});
				}
			},
			"background",
		);
	}
}
