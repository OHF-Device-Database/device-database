import { createType, inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { Uuid } from "../../../type/codec/uuid";
import { type DatabaseTransaction, IDatabaseDerived } from "../../database";
import { deleteDerivedDevices } from "../../database/query/derived/device-delete";
import {
	getDerivedDevice,
	getDerivedDevices,
	getDerivedDevicesBySearchTerm,
} from "../../database/query/derived/device-get";
import { insertDerivedDevices } from "../../database/query/derived/device-insert";
import { DeriveDerivableSubject } from "./subject";

import type { Maybe } from "../../../type/maybe";
import type { DeriveDerivable } from "../base";

const DeviceQualifier = Schema.Union(
	Schema.Struct({
		model: Schema.Union(Schema.String, Schema.Null),
		modelId: Schema.String,
	}),
	Schema.Struct({
		model: Schema.String,
		modelId: Schema.Union(Schema.String, Schema.Null),
	}),
	Schema.Struct({
		model: Schema.String,
		modelId: Schema.String,
	}),
);

const Device = Schema.extend(
	Schema.Struct({
		id: Uuid,
		integration: Schema.String,
		manufacturer: Schema.String,
		count: Schema.Number,
	}),
	DeviceQualifier,
);

type Device = typeof Device.Type;

export interface IDeriveDerivableDevice {
	devices(term?: string): AsyncIterable<Device>;
	device(id: Uuid): Promise<Maybe<Device>>;
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

	private static guard = {
		device: Schema.is(Device),
	};

	async device(id: Uuid): Promise<Maybe<Device>> {
		const bound = getDerivedDevice.bind.anonymous([id]);

		const device = await this.db.run(bound);
		if (!DeriveDerivableDevice.guard.device(device)) {
			return null;
		}

		return device;
	}

	async *devices(term?: string): AsyncIterable<Device> {
		let bound;
		if (typeof term !== "undefined") {
			bound = getDerivedDevicesBySearchTerm.bind.anonymous([
				`%${term
					// "%" and "_" characters have special meaning
					.replaceAll("%", "\\%")
					.replaceAll("_", "\\_")}%`,
			]);
		} else {
			bound = getDerivedDevices.bind.anonymous([]);
		}

		for await (const device of this.db.run(bound)) {
			if (!DeriveDerivableDevice.guard.device(device)) {
				continue;
			}

			yield device;
		}
	}
}
