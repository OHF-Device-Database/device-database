import { inject } from "@lppedd/di-wise-neo";

import { type DatabaseTransaction, IDatabaseDerived } from "../../database";
import { deleteDerivedSubmissions } from "../../database/query/derived/submission-delete";
import { getDerivedSubmissions } from "../../database/query/derived/submission-get";
import { insertDerivedSubmission } from "../../database/query/derived/submission-insert";
import { IIntrospection } from "../../introspect";

import type { DeriveDerivable } from "../base";

export class DeriveDerivableSubmissionFaulty
	implements DeriveDerivable<"derived", typeof DeriveDerivableSubmissionFaulty>
{
	static readonly id = Symbol("DeriveDerivableSubmissionFaulty");

	static readonly prerequisites = [];
	static readonly schedule = {
		minute: "*/2",
	} as const;

	constructor(
		private db = inject(IDatabaseDerived),
		introspection: IIntrospection = inject(IIntrospection),
	) {
		introspection.metric.gauge(
			{
				name: "snapshot_faulty_submissions_total",
				help: "amount of faulty submissions",
				labelNames: ["state", "version"],
			},
			async (collector) => {
				const bound = getDerivedSubmissions.bind.anonymous([]);

				for await (const row of this.db.run(bound)) {
					collector.set(
						{ version: row.hassVersion, state: row.state },
						row.count,
					);
				}
			},
		);
	}

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedSubmissions.bind.anonymous([]));
		await t.run(insertDerivedSubmission.bind.anonymous([]));
	}
}
