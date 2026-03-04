import { inject } from "@lppedd/di-wise-neo";

import { type DatabaseTransaction, IDatabaseDerived } from "../../database";
import { deleteDerivedMetaEntityStats } from "../../database/query/derived/meta-delete";
import { getDerivedMetaEntityStats } from "../../database/query/derived/meta-get";
import { IIntrospection } from "../../introspect";

import type { DeriveDerivable } from "../base";

export class DeriveDerivableMetaEntityStat
	implements DeriveDerivable<"derived", typeof DeriveDerivableMetaEntityStat>
{
	static readonly id = Symbol("DeriveDerivableMetaEntityStat");

	static readonly prerequisites = [];
	static readonly schedule = {
		minute: "*/5",
	} as const;

	constructor(
		private db = inject(IDatabaseDerived),
		introspection: IIntrospection = inject(IIntrospection),
	) {
		introspection.metric.gauge(
			{
				name: "database_size_total",
				help: "size of database",
				labelNames: ["entity"],
			},
			async (collector) => {
				const bound = getDerivedMetaEntityStats.bind.anonymous([], {
					rowMode: "tuple",
				});

				for await (const row of this.db.run(bound, "background")) {
					collector.set({ entity: row[0] }, row[1]);
				}
			},
		);
	}

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedMetaEntityStats.bind.anonymous([]));
		await t.run({
			database: "derived",
			name: "InsertDeriveMetaEntityStat",
			query: `insert into derived_meta_entity_stat
        select name, pgsize from dbstat where aggregate = true and schema = 'staging'`,
			parameters: [],
			connectionMode: "w",
			resultMode: "none",
			rowMode: "tuple",
			integerMode: "number",
		});
	}
}
