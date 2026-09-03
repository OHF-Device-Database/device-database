import { inject } from "@lppedd/di-wise-neo";

import { IDatabaseDerived } from "../../database";
import { deleteDerivedSubjects } from "../../database/query/derived/subject-delete";
import { insertDerivedSubjects } from "../../database/query/derived/subject-insert";

import type { DeriveDerivable } from "../base";

export class DeriveDerivableSubject
	implements DeriveDerivable<typeof DeriveDerivableSubject>
{
	static readonly id = Symbol("DeriveDerivableSubject");

	static readonly prerequisites = [];

	constructor(private db = inject(IDatabaseDerived)) {}

	async derive(): Promise<void> {
		await this.db.begin("w", async (t) => {
			await t.run(deleteDerivedSubjects.bind.anonymous([]));
			await t.run(insertDerivedSubjects.bind.named({ window: 60 * 60 * 25 }));
		});
	}
}
