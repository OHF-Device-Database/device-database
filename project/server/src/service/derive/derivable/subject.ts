import { deleteDerivedSubjects } from "../../database/query/derived/subject-delete";
import { insertDerivedSubjects } from "../../database/query/derived/subject-insert";

import type { DatabaseTransaction } from "../../database";
import type { DeriveDerivable } from "../base";

export class DeriveDerivableSubject
	implements DeriveDerivable<"derived", typeof DeriveDerivableSubject>
{
	static readonly id = Symbol("DeriveDerivableSubject");

	static readonly prerequisites = [];
	static readonly schedule = {
		minute: "*/10",
	} as const;

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedSubjects.bind.anonymous([]));
		await t.run(insertDerivedSubjects.bind.named({ window: 60 * 60 * 25 }));
	}
}
