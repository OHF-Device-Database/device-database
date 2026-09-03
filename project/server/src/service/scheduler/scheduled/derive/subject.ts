import { inject } from "@lppedd/di-wise-neo";

import { IDatabaseDerived } from "../../../database";
import { deleteDerivedSubjects } from "../../../database/query/derived/subject-delete";
import { insertDerivedSubjects } from "../../../database/query/derived/subject-insert";

import type { SchedulerScheduled } from "../../base";

export class SchedulerScheduledDeriveSubject
	implements SchedulerScheduled<typeof SchedulerScheduledDeriveSubject>
{
	static readonly id = Symbol("SchedulerScheduledDeriveSubject");

	static readonly prerequisites = [];

	constructor(private db = inject(IDatabaseDerived)) {}

	async run(): Promise<void> {
		await this.db.begin("w", async (t) => {
			await t.run(deleteDerivedSubjects.bind.anonymous([]));
			await t.run(insertDerivedSubjects.bind.named({ window: 60 * 60 * 25 }));
		});
	}
}
