import { Inject, Injectable } from "@nestjs/common";

import { DatabaseStaging } from "../../../database/database.module";
import { ServiceSchedulerScheduledCompactionOrphanedAttached } from "./orphaned/attached.service";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./orphaned/submission.service";

import type { IDatabase } from "../../../../service/database";
import type { SchedulerScheduled } from "../../../../service/scheduler/base";

@Injectable()
export class ServiceSchedulerScheduledCompactionOptimize
	implements
		SchedulerScheduled<typeof ServiceSchedulerScheduledCompactionOptimize>
{
	static readonly id = Symbol("ServiceSchedulerScheduledCompactionOptimize");

	static readonly prerequisites = [
		ServiceSchedulerScheduledCompactionOrphanedSubmission.id,
		ServiceSchedulerScheduledCompactionOrphanedAttached.id,
	];
	static readonly schedule = {
		minute: "0",
		hour: "0",
	} as const;

	constructor(@Inject(DatabaseStaging) private db: IDatabase<"staging">) {}

	async run(): Promise<void> {
		await this.db.run(
			{
				query: "pragma wal_checkpoint(truncate);",
				name: "Checkpoint",
				parameters: [],
				database: "staging",
				connectionMode: "w",
				integerMode: "number",
				resultMode: "one",
				rowMode: "object",
			},
			"background",
		);

		await this.db.run(
			{
				/*
				https://sqlite.org/lang_analyze.html#periodically_run_pragma_optimize_
				"The PRAGMA optimize command will normally only consider running ANALYZE on tables that have been previously queried by the same database connection or that do not have entries in the sqlite_stat1 table.
				However, if the 0x10000 bit is added to the argument, PRAGMA optimize will examine all tables to see if they can benefit from ANALYZE, not just those that have been recently queried."
				*/
				query: "pragma optimize=0x10000;",
				name: "Optimize",
				parameters: [],
				database: "staging",
				connectionMode: "w",
				integerMode: "number",
				resultMode: "one",
				rowMode: "object",
			},
			"background",
		);
	}
}
