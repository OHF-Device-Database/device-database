import { createType, inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { Uuid } from "../../../type/codec/uuid";
import { isNone, isSome } from "../../../type/maybe";
import { type DatabaseTransaction, IDatabaseDerived } from "../../database";
import { deleteDerivedDevices } from "../../database/query/derived/device-delete";
import { getDerivedDevices } from "../../database/query/derived/device-get";
import { insertDerivedDevices } from "../../database/query/derived/device-insert";
import { DeriveDerivableSubject } from "./subject";

import type { DeriveDerivable } from "../base";

type DeviceModel =
	| { model: string; modelId: string }
	| { model?: string; modelId: string }
	| { model: string; modelId?: string };

type Device = {
	id: Uuid;
	integration: string;
	manufacturer: string;
	count: number;
} & DeviceModel;

export interface IDeriveDerivableDevice {
	devices(): AsyncIterable<Device>;
}

export const IDeriveDerivableDevice = createType<IDeriveDerivableDevice>(
	"IDeriveDerivableDevice",
);

export class DeriveDerivableDevice
	implements
		DeriveDerivable<"derived", typeof DeriveDerivableDevice>,
		IDeriveDerivableDevice
{
	static readonly id = Symbol("DeriveDerivableDevice");

	static readonly prerequisites = [DeriveDerivableSubject.id];
	static readonly schedule = {
		minute: "*/30",
	} as const;

	constructor(private db = inject(IDatabaseDerived)) {}

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedDevices.bind.anonymous([]));
		await t.run(insertDerivedDevices.bind.anonymous([]));
	}

	async *devices(): AsyncIterable<Device> {
		const bound = getDerivedDevices.bind.anonymous([]);
		for await (const device of this.db.run(bound)) {
			if (!Schema.is(Uuid)(device.id)) {
				continue;
			}

			const independent = {
				id: device.id,
				integration: device.integration,
				manufacturer: device.manufacturer,
				count: device.count,
			} as const;

			if (isSome(device.model) && isSome(device.modelId)) {
				yield {
					...independent,
					model: device.model,
					modelId: device.modelId,
				};
			} else if (isSome(device.model) && isNone(device.modelId)) {
				yield {
					...independent,
					model: device.model,
				};
			} else if (isNone(device.model) && isSome(device.modelId)) {
				yield {
					...independent,
					modelId: device.modelId,
				};
			}
		}
	}
}
