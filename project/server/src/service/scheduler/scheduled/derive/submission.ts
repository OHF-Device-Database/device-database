import { inject } from "@lppedd/di-wise-neo";

import { IDatabaseDerived } from "../../../database";
import { deleteDerivedSubmissions } from "../../../database/query/derived/submission-delete";
import { getDerivedSubmissions } from "../../../database/query/derived/submission-get";
import { insertDerivedSubmission } from "../../../database/query/derived/submission-insert";
import { IIntrospection } from "../../../introspect";

import type { SchedulerScheduled } from "../../base";

export class SchedulerScheduledDeriveSubmissionFaulty
	implements SchedulerScheduled<typeof SchedulerScheduledDeriveSubmissionFaulty>
{
	static readonly id = Symbol("SchedulerScheduledDeriveSubmissionFaulty");

	static readonly prerequisites = [];

	constructor(
		private db = inject(IDatabaseDerived),
		introspection: IIntrospection = inject(IIntrospection),
	) {
		introspection.metric.gauge(
			{
				name: "snapshot_faulty_submissions_total",
				help: "amount of faulty submissions",
				labelNames: ["state"],
				registry: "global",
			},
			async (collector) => {
				const bound = getDerivedSubmissions.bind.anonymous([]);

				for await (const row of this.db.run(bound)) {
					collector.set({ state: row.state }, row.count);
				}
			},
		);
	}

	async run(): Promise<void> {
		await this.db.begin("w", async (t) => {
			await t.run(deleteDerivedSubmissions.bind.anonymous([]));
			await t.run(insertDerivedSubmission.bind.anonymous([]));
		});
	}
}
