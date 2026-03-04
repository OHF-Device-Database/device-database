import { deleteDerivedDevices } from "../../database/query/derived/device-delete";
import { insertDerivedDevices } from "../../database/query/derived/device-insert";
import { DeriveDerivableSubject } from "./subject";

import type { DatabaseTransaction } from "../../database";
import type { DeriveDerivable } from "../base";

export class DeriveDerivableDevice
	implements DeriveDerivable<"derived", typeof DeriveDerivableDevice>
{
	static readonly id = Symbol("DeriveDerivableDevice");

	static readonly prerequisites = [DeriveDerivableSubject.id];
	static readonly schedule = {
		minute: "*/30",
	} as const;

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedDevices.bind.anonymous([]));
		await t.run(insertDerivedDevices.bind.anonymous([]));
	}
}
