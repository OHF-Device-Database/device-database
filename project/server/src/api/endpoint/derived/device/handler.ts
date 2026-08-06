import { Schema } from "effect";
import type { PickDeep } from "type-fest";

import integrations from "../../../../categorized-integrations.json";
import { logger } from "../../../../logger";
import {
	type DerivableDeviceMono,
	DeviceCategoryIdValue,
	DeviceConnectivityValue,
} from "../../../../service/derive/derivable/device";
import { floor, Integer } from "../../../../type/codec/integer";
import { Uuid } from "../../../../type/codec/uuid";
import { isNone, isSome } from "../../../../type/maybe";
import { idempotentEndpoint } from "../../../base";
import { paginate } from "../../../paginate";

import type { Dependency } from "../../../dependency";

type Integration = keyof typeof integrations;

const mapDevice = (d: Omit<DerivableDeviceMono, "duplicates">) => {
	const integration = Object.keys(integrations).includes(d.integration)
		? integrations[d.integration as Integration]
		: undefined;

	if (typeof integration === "undefined") {
		logger.warn(`integration definition missing for <${d.integration}>`, {
			integration: d.integration,
		});

		return null;
	}

	const independent = {
		integration: {
			name: integration.title,
			domain: d.integration,
		},
		manufacturer: d.manufacturer,
		first_encountered: d.firstEncounteredAt.toISOString(),
		categories: d.categories,
		connectivity: d.connectivity,
		versions: {
			software: d.versions.software.map((item) => ({
				version: item.version,
				active: item.active,
				first_encountered: item.firstEncounteredAt.toISOString(),
			})),
			hardware: d.versions.hardware.map((item) => ({
				version: item.version,
				first_encountered: item.firstEncounteredAt.toISOString(),
			})),
		},
		entities: d.entities.map((item) => ({
			domain: item.domain,
			original_device_class: item.originalDeviceClass,
		})),
		count: d.count,
	} as const;

	if (typeof d.model !== "undefined" && typeof d.modelId !== "undefined") {
		return {
			...independent,
			model: d.model,
			model_id: d.modelId,
		} as const;
	} else if (
		typeof d.model !== "undefined" &&
		typeof d.modelId === "undefined"
	) {
		return {
			...independent,
			model: d.model,
		} as const;
	} else if (
		typeof d.model === "undefined" &&
		typeof d.modelId !== "undefined"
	) {
		return {
			...independent,
			model_id: d.modelId,
		} as const;
	}

	return null;
};

const ParametersDevices = Schema.Struct({
	query: Schema.partial(
		Schema.Struct({
			term: Schema.String,
			canonical: Schema.BooleanFromString,
			manufacturer: Schema.Union(Schema.Array(Schema.String), Schema.String),
			"!manufacturer": Schema.Union(Schema.Array(Schema.String), Schema.String),
			category: Schema.Union(
				Schema.Array(DeviceCategoryIdValue),
				DeviceCategoryIdValue,
			),
			"!category": Schema.Union(
				Schema.Array(DeviceCategoryIdValue),
				DeviceCategoryIdValue,
			),
			connectivity: Schema.Union(
				Schema.Array(DeviceConnectivityValue),
				DeviceConnectivityValue,
			),
			"!connectivity": Schema.Union(
				Schema.Array(DeviceConnectivityValue),
				DeviceConnectivityValue,
			),
			page: Schema.compose(Schema.NumberFromString, Integer),
			size: Schema.compose(
				Schema.NumberFromString.pipe(Schema.between(10, 50)),
				Integer,
			),
		}),
	),
});

export const getDerivedDevices = (
	d: PickDeep<Dependency, "ingress" | "derivable.device">,
) =>
	idempotentEndpoint(
		"/api/unstable/derived/devices",
		"get",
		ParametersDevices,
		async (
			{
				query: {
					page,
					size,
					term,
					canonical,
					category: includeCategory,
					"!category": excludeCategory,
					connectivity: includeConnectivity,
					"!connectivity": excludeConnectivity,
					manufacturer: includeManufacturer,
					"!manufacturer": excludeManufacturer,
				},
			},
			{ path },
		) => {
			const query = {
				term,
				canonical: canonical ?? true,
				include: {
					categories:
						typeof includeCategory !== "undefined"
							? new Set(
									typeof includeCategory === "string"
										? [includeCategory]
										: includeCategory,
								)
							: undefined,
					connectivities:
						typeof includeConnectivity !== "undefined"
							? new Set(
									typeof includeConnectivity === "string"
										? [includeConnectivity]
										: includeConnectivity,
								)
							: undefined,
					manufacturers:
						typeof includeManufacturer !== "undefined"
							? new Set(
									typeof includeManufacturer === "string"
										? [includeManufacturer]
										: includeManufacturer,
								)
							: undefined,
				},
				exclude: {
					categories:
						typeof excludeCategory !== "undefined"
							? new Set(
									typeof excludeCategory === "string"
										? [excludeCategory]
										: excludeCategory,
								)
							: undefined,
					connectivities:
						typeof excludeConnectivity !== "undefined"
							? new Set(
									typeof excludeConnectivity === "string"
										? [excludeConnectivity]
										: excludeConnectivity,
								)
							: undefined,
					manufacturers:
						typeof excludeManufacturer !== "undefined"
							? new Set(
									typeof excludeManufacturer === "string"
										? [excludeManufacturer]
										: excludeManufacturer,
								)
							: undefined,
				},
			} as const;

			const paginated = await paginate(d)({
				slice: ({ offset, limit }) =>
					d.derivable.device.devices.slice(query, { offset, limit }),
				count: async () => await d.derivable.device.devices.count(query),
			})({
				path,
				page,
				size,
			});

			const mapped = paginated.items.flatMap((device) => {
				const mapped = mapDevice(device);
				return isSome(mapped)
					? [
							{
								...mapped,
								id: device.id,
								url: d.ingress.url.device.self(device.id).toString(),
								duplicates: device.duplicates.map((id) => ({
									id,
									url: d.ingress.url.device.self(id).toString(),
								})),
							},
						]
					: [];
			});

			return {
				code: 200,
				body: mapped,
				headers: {
					"cache-control": "max-age=1800",
					...paginated.headers,
				},
			} as const;
		},
	);

const ParametersDevice = Schema.Struct({
	path: Schema.Struct({
		id: Uuid,
	}),
});

export const getDerivedDevice = (
	d: PickDeep<Dependency, "ingress" | "derivable.device">,
) =>
	idempotentEndpoint(
		"/api/unstable/derived/devices/{id}",
		"get",
		ParametersDevice,
		async ({ path: { id } }) => {
			const result = await d.derivable.device.device({ id });
			if (isNone(result)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			const device = mapDevice(result);
			if (isNone(device)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			const query = { canonical: new Set([id]) };

			const paginated = await paginate(d)({
				slice: ({ offset, limit }) =>
					d.derivable.device.devices.slice(query, { offset, limit }),
				count: async () => await d.derivable.device.devices.count(query),
			})({
				path: d.ingress.url.device.duplicates(id),
				page: floor(0),
				size: undefined,
			});

			return {
				code: 200,
				body: {
					...device,
					duplicates: {
						items: paginated.items.flatMap((device) => {
							const mapped = mapDevice(device);
							return isSome(mapped)
								? [
										{
											...mapped,
											id: device.id,
											url: d.ingress.url.device.self(device.id).toString(),
										},
									]
								: [];
						}),
						total: paginated.total,
						next: paginated.links.next?.toString(),
					},
				},
				headers: {
					"cache-control": "max-age=1800",
				},
			} as const;
		},
	);

const ParametersDeviceDuplicates = Schema.Struct({
	path: Schema.Struct({
		id: Uuid,
	}),
	query: Schema.partial(
		Schema.Struct({
			page: Schema.compose(Schema.NumberFromString, Integer),
			size: Schema.compose(
				Schema.NumberFromString.pipe(Schema.between(10, 50)),
				Integer,
			),
		}),
	),
});

export const getDerivedDeviceDuplicates = (
	d: PickDeep<Dependency, "ingress" | "derivable.device">,
) =>
	idempotentEndpoint(
		"/api/unstable/derived/devices/{id}/duplicates",
		"get",
		ParametersDeviceDuplicates,
		async ({ path: { id }, query: { page, size } }, { path }) => {
			const result = await d.derivable.device.device({ id });
			if (isNone(result)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			const query = {
				canonical: new Set([id]),
			};

			const paginated = await paginate(d)({
				slice: ({ offset, limit }) =>
					d.derivable.device.devices.slice(query, { offset, limit }),
				count: async () => await d.derivable.device.devices.count(query),
			})({
				path,
				page,
				size,
			});

			const mapped = paginated.items.flatMap((device) => {
				const mapped = mapDevice(device);
				return isSome(mapped)
					? [
							{
								...mapped,
								id: device.id,
								url: d.ingress.url.device.self(device.id).toString(),
							},
						]
					: [];
			});

			return {
				code: 200,
				body: mapped,
				headers: {
					"cache-control": "max-age=1800",
					...paginated.headers,
				},
			} as const;
		},
	);
