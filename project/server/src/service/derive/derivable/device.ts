import { createType, inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { parseJson } from "effect/Schema";

import { Category } from "../../../categories";
import categorizedIntegrations from "../../../categorized-integrations.json" with {
	type: "json",
};
import { DateFromUnixTime } from "../../../type/codec/date";
import { floor, Integer } from "../../../type/codec/integer";
import { Uuid } from "../../../type/codec/uuid";
import { isNone, isSome, type Maybe } from "../../../type/maybe";
import {
	counted,
	type DatabaseTransaction,
	IDatabaseDerived,
} from "../../database";
import { deleteDerivedDevices } from "../../database/query/derived/device-delete";
import {
	getDerivedDevice,
	getDerivedDevices,
	getDerivedDevicesManufacturerCount,
} from "../../database/query/derived/device-get";
import { insertDerivedDevices } from "../../database/query/derived/device-insert";
import { DeriveDerivableSubject } from "./subject";

import type { DeriveDerivable } from "../base";

type DeviceModel =
	| { model: string; modelId: string }
	| { model?: string | undefined; modelId: string }
	| { model: string; modelId?: string | undefined };

export const DeviceCategoryId = Category;

export const DeviceCategoryIdValue = Schema.Enums(DeviceCategoryId);
export type DeviceCategoryIdValue = typeof DeviceCategoryIdValue.Type;

const isDeviceCategoryIdValue = Schema.is(DeviceCategoryIdValue);

type DeviceCategory = {
	id: DeviceCategoryIdValue;
	source: "integration-manual" | "integration-inferred";
};

export enum DeviceConnectivity {
	Offline = "offline",
	Online = "online",
}

export const DeviceConnectivityValue = Schema.Enums(DeviceConnectivity);
export type DeviceConnectivityValue = typeof DeviceConnectivityValue.Type;

const isDeviceConnectivityValue = Schema.is(DeviceConnectivityValue);

type MonoDevice = {
	integration: string;
	manufacturer: string;
	categories?: DeviceCategory[] | undefined;
	connectivity?: DeviceConnectivityValue | undefined;
	firstEncounteredAt: Date;
	versions: {
		software: {
			version: string;
			firstEncounteredAt: Date;
		}[];
		hardware: {
			version: string;
			firstEncounteredAt: Date;
		}[];
	};
	entities: { domain: string }[];
	count: number;
} & DeviceModel;

type PolyDevice = MonoDevice & {
	id: Uuid;
};

type QueryMonoDevice = {
	id: Uuid;
};

type QueryPolyDevice = {
	term?: string | undefined;
	include: {
		connectivities?: Set<DeviceConnectivityValue> | undefined;
		categories?: Set<DeviceCategoryIdValue> | undefined;
		manufacturers?: Set<string> | undefined;
	};
	exclude: {
		connectivities?: Set<DeviceConnectivityValue> | undefined;
		categories?: Set<DeviceCategoryIdValue> | undefined;
		manufacturers?: Set<string> | undefined;
	};
};

const DeviceModelCodec = Schema.Union(
	Schema.Struct({
		model: Schema.String,
		modelId: Schema.String,
	}),
	Schema.Struct({
		model: Schema.String,
		modelId: Schema.Null,
	}),
	Schema.Struct({
		model: Schema.Null,
		modelId: Schema.String,
	}),
);
const DeviceCodec = Schema.extend(
	Schema.Struct({
		id: Uuid,
		integration: Schema.String,
		manufacturer: Schema.String,
		firstEncounteredAt: DateFromUnixTime,
		versionsSoftware: parseJson(
			Schema.mutable(
				Schema.Array(
					Schema.Struct({
						version: Schema.String,
						firstEncounteredAt: DateFromUnixTime,
					}),
				),
			),
		),
		versionsHardware: parseJson(
			Schema.mutable(
				Schema.Array(
					Schema.Struct({
						version: Schema.String,
						firstEncounteredAt: DateFromUnixTime,
					}),
				),
			),
		),
		entities: parseJson(
			Schema.mutable(Schema.Array(Schema.Struct({ domain: Schema.String }))),
		),
		count: Integer,
	}),
	DeviceModelCodec,
);

export interface IDeriveDerivableDevice {
	devices: {
		slice: (
			query: QueryPolyDevice,
			{
				offset,
				limit,
			}: {
				offset: Integer;
				limit: Integer;
			},
		) => AsyncIterable<PolyDevice>;
		count(query: QueryPolyDevice): Promise<Integer>;
	};
	device(query: QueryMonoDevice): Promise<Maybe<MonoDevice>>;
	manufacturers(): AsyncIterable<[manufacturer: string, count: number]>;
}

const integrationCategories: Map<string, DeviceCategory[]> = new Map();
for (const [integration, manifest] of Object.entries(categorizedIntegrations)) {
	if (!("category" in manifest)) {
		continue;
	}

	const source = manifest.category.inferred
		? "integration-inferred"
		: ("integration-manual" as const);

	integrationCategories.set(
		integration,
		manifest.category.classified.flatMap((category) =>
			isDeviceCategoryIdValue(category) ? [{ id: category, source }] : [],
		),
	);
}

const integrationDeviceConnectivity: Map<string, DeviceConnectivityValue> =
	new Map();
for (const [integration, manifest] of Object.entries(categorizedIntegrations)) {
	if (!("connectivity" in manifest)) {
		continue;
	}

	if (!isDeviceConnectivityValue(manifest.connectivity)) {
		continue;
	}

	integrationDeviceConnectivity.set(integration, manifest.connectivity);
}

// category identifier → integrations
const categoryIntegrations: Map<DeviceCategoryIdValue, string[]> = new Map();
for (const [integration, manifest] of Object.entries(categorizedIntegrations)) {
	if (!("category" in manifest)) {
		continue;
	}

	for (const category of manifest.category.classified) {
		if (!isDeviceCategoryIdValue(category)) {
			continue;
		}

		const bucket = categoryIntegrations.get(category);
		if (typeof bucket === "undefined") {
			categoryIntegrations.set(category, [integration]);
		} else {
			bucket.push(integration);
		}
	}
}

// connectivity → integrations
const connectivityIntegrations: Map<DeviceConnectivityValue, string[]> =
	new Map();
for (const [integration, manifest] of Object.entries(categorizedIntegrations)) {
	if (!("connectivity" in manifest)) {
		continue;
	}

	if (!isDeviceConnectivityValue(manifest.connectivity)) {
		continue;
	}

	const bucket = connectivityIntegrations.get(manifest.connectivity);
	if (typeof bucket === "undefined") {
		connectivityIntegrations.set(manifest.connectivity, [integration]);
	} else {
		bucket.push(integration);
	}
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
		minute: "0",
		hour: "0",
	} as const;

	constructor(private db = inject(IDatabaseDerived)) {}

	async derive(t: DatabaseTransaction<"derived", "w">): Promise<void> {
		await t.run(deleteDerivedDevices.bind.anonymous([]));
		await t.run(insertDerivedDevices.bind.anonymous([]));
	}

	private static decoderDevice = Schema.decodeUnknownEither(DeviceCodec);

	private static queryParameterIntegrations(
		categories: Set<DeviceCategoryIdValue> | undefined,
		connectivities: Set<DeviceConnectivityValue> | undefined,
	): Maybe<string[]> {
		let fromCategories: Set<string> | undefined;
		if (typeof categories !== "undefined" && categories.size > 0) {
			fromCategories = new Set();
			for (const category of categories) {
				for (const integration of categoryIntegrations.get(category) ?? []) {
					fromCategories.add(integration);
				}
			}
		}

		let fromConnectivities: Set<string> | undefined;
		if (typeof connectivities !== "undefined" && connectivities.size > 0) {
			fromConnectivities = new Set();
			for (const connectivity of connectivities) {
				for (const integration of connectivityIntegrations.get(connectivity) ??
					[]) {
					fromConnectivities.add(integration);
				}
			}
		}

		if (
			typeof fromCategories !== "undefined" &&
			typeof fromConnectivities === "undefined"
		) {
			return [...fromCategories];
		} else if (
			typeof fromCategories === "undefined" &&
			typeof fromConnectivities !== "undefined"
		) {
			return [...fromConnectivities];
		} else if (
			typeof fromCategories !== "undefined" &&
			typeof fromConnectivities !== "undefined"
		) {
			return [...fromCategories.intersection(fromConnectivities)];
		} else {
			return null;
		}
	}

	private static queryParameters({ term, include, exclude }: QueryPolyDevice) {
		const includeIntegrations =
			DeriveDerivableDevice.queryParameterIntegrations(
				include.categories,
				include.connectivities,
			);

		const excludeIntegrations =
			DeriveDerivableDevice.queryParameterIntegrations(
				exclude.categories,
				exclude.connectivities,
			);

		return {
			includeIntegrations: isSome(includeIntegrations)
				? JSON.stringify(includeIntegrations)
				: null,
			excludeIntegrations: isSome(excludeIntegrations)
				? JSON.stringify(excludeIntegrations)
				: null,
			includeManufacturers:
				typeof include.manufacturers !== "undefined" &&
				include.manufacturers.size > 0
					? JSON.stringify([...include.manufacturers])
					: null,
			excludeManufacturers:
				typeof exclude.manufacturers !== "undefined" &&
				exclude.manufacturers.size > 0
					? JSON.stringify([...exclude.manufacturers])
					: null,
			term: `%${(term ?? "")
				// "%" and "_" characters have special meaning
				.replaceAll("%", "\\%")
				.replaceAll("_", "\\_")}%`,
		};
	}

	private async *devicesSlice(
		query: QueryPolyDevice,
		{
			offset,
			limit,
		}: {
			offset: Integer;
			limit: Integer;
		},
	): AsyncIterable<PolyDevice> {
		const bound = getDerivedDevices.bind.named({
			...DeriveDerivableDevice.queryParameters(query),
			offset,
			limit,
		});

		for await (const device of this.db.run(bound)) {
			const decoded = DeriveDerivableDevice.decoderDevice(device);
			if (isLeft(decoded)) {
				continue;
			}

			if (!Schema.is(Uuid)(device.id)) {
				continue;
			}

			const independent = {
				id: decoded.right.id,
				integration: decoded.right.integration,
				manufacturer: decoded.right.manufacturer,
				firstEncounteredAt: decoded.right.firstEncounteredAt,
				categories: integrationCategories.get(decoded.right.integration),
				connectivity: integrationDeviceConnectivity.get(
					decoded.right.integration,
				),
				versions: {
					software: decoded.right.versionsSoftware,
					hardware: decoded.right.versionsHardware,
				},
				entities: decoded.right.entities,
				count: decoded.right.count,
			} as const;

			if (isSome(decoded.right.model) && isSome(decoded.right.modelId)) {
				yield {
					...independent,
					model: decoded.right.model,
					modelId: decoded.right.modelId,
				};
			} else if (isSome(decoded.right.model) && isNone(decoded.right.modelId)) {
				yield {
					...independent,
					model: decoded.right.model,
				};
			} else if (isNone(decoded.right.model) && isSome(decoded.right.modelId)) {
				yield {
					...independent,
					modelId: decoded.right.modelId,
				};
			}
		}
	}

	private async devicesCount(query: QueryPolyDevice): Promise<Integer> {
		const bound = counted(getDerivedDevices).bind.named(
			{
				...DeriveDerivableDevice.queryParameters(query),
				offset: null,
				limit: null,
			},
			{ rowMode: "tuple" },
		);

		const count = (await this.db.run(bound))?.at(0) ?? 0;

		return floor(count);
	}

	devices = {
		slice: this.devicesSlice.bind(this),
		count: this.devicesCount.bind(this),
	};

	async device(query: QueryMonoDevice): Promise<Maybe<MonoDevice>> {
		const device = await this.db.run(getDerivedDevice.bind.named(query));
		const decoded = DeriveDerivableDevice.decoderDevice(device);
		if (isLeft(decoded)) {
			return null;
		}

		const independent = {
			id: decoded.right.id,
			integration: decoded.right.integration,
			manufacturer: decoded.right.manufacturer,
			firstEncounteredAt: decoded.right.firstEncounteredAt,
			categories: integrationCategories.get(decoded.right.integration),
			connectivity: integrationDeviceConnectivity.get(
				decoded.right.integration,
			),
			versions: {
				software: decoded.right.versionsSoftware,
				hardware: decoded.right.versionsHardware,
			},
			entities: decoded.right.entities,
			count: decoded.right.count,
		} as const;

		if (isSome(decoded.right.model) && isSome(decoded.right.modelId)) {
			return {
				...independent,
				model: decoded.right.model,
				modelId: decoded.right.modelId,
			};
		} else if (isSome(decoded.right.model) && isNone(decoded.right.modelId)) {
			return {
				...independent,
				model: decoded.right.model,
			};
		} else if (isNone(decoded.right.model) && isSome(decoded.right.modelId)) {
			return {
				...independent,
				modelId: decoded.right.modelId,
			};
		} else {
			return null;
		}
	}

	public async *manufacturers(): AsyncIterable<
		[manufacturer: string, count: number]
	> {
		const bound = getDerivedDevicesManufacturerCount.bind.anonymous([], {
			rowMode: "tuple",
		});

		for await (const row of this.db.run(bound)) {
			yield row;
		}
	}
}
