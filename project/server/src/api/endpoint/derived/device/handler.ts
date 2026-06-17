import { Schema } from "effect";
import type { PickDeep } from "type-fest";

import integrations from "../../../../categorized-integrations.json";
import {
	DeviceCategoryIdValue,
	DeviceConnectivityValue,
} from "../../../../service/derive/derivable/device";
import { Integer } from "../../../../type/codec/integer";
import { Uuid } from "../../../../type/codec/uuid";
import { isNone } from "../../../../type/maybe";
import { idempotentEndpoint } from "../../../base";
import { paginate } from "../../../paginate";

import type { Dependency } from "../../../dependency";

type Integration = keyof typeof integrations;

const ParametersDevices = Schema.Struct({
	query: Schema.partial(
		Schema.Struct({
			term: Schema.String,
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

			const mapped = [];
			for (const item of paginated.items) {
				const integration = Object.keys(integrations).includes(item.integration)
					? integrations[item.integration as Integration]
					: undefined;

				const independent = {
					id: item.id,
					integration: {
						name:
							typeof integration !== "undefined"
								? integration.title
								: undefined,
						domain: item.integration,
					},
					manufacturer: item.manufacturer,
					first_encountered: item.firstEncounteredAt.toISOString(),
					categories: item.categories,
					connectivity: item.connectivity,
					versions: {
						software: item.versions.software.map((item) => ({
							version: item.version,
							first_encountered: item.firstEncounteredAt.toISOString(),
						})),
						hardware: item.versions.hardware.map((item) => ({
							version: item.version,
							first_encountered: item.firstEncounteredAt.toISOString(),
						})),
					},
					count: item.count,
				} as const;

				if (
					typeof item.model !== "undefined" &&
					typeof item.modelId !== "undefined"
				) {
					mapped.push({
						...independent,
						model: item.model,
						model_id: item.modelId,
					});
				} else if (
					typeof item.model !== "undefined" &&
					typeof item.modelId === "undefined"
				) {
					mapped.push({
						...independent,
						model: item.model,
					});
				} else if (
					typeof item.model === "undefined" &&
					typeof item.modelId !== "undefined"
				) {
					mapped.push({
						...independent,
						model_id: item.modelId,
					});
				} else {
				}
			}

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

			const integration = Object.keys(integrations).includes(result.integration)
				? integrations[result.integration as Integration]
				: undefined;

			const independent = {
				integration: {
					name:
						typeof integration !== "undefined" ? integration.title : undefined,
					domain: result.integration,
				},
				manufacturer: result.manufacturer,
				first_encountered: result.firstEncounteredAt.toISOString(),
				categories: result.categories,
				connectivity: result.connectivity,
				versions: {
					software: result.versions.software.map((item) => ({
						version: item.version,
						first_encountered: item.firstEncounteredAt.toISOString(),
					})),
					hardware: result.versions.hardware.map((item) => ({
						version: item.version,
						first_encountered: item.firstEncounteredAt.toISOString(),
					})),
				},
				count: result.count,
			} as const;

			let combined;
			if (
				typeof result.model !== "undefined" &&
				typeof result.modelId !== "undefined"
			) {
				combined = {
					...independent,
					model: result.model,
					model_id: result.modelId,
				} as const;
			} else if (
				typeof result.model !== "undefined" &&
				typeof result.modelId === "undefined"
			) {
				combined = {
					...independent,
					model: result.model,
				} as const;
			} else if (
				typeof result.model === "undefined" &&
				typeof result.modelId !== "undefined"
			) {
				combined = {
					...independent,
					model_id: result.modelId,
				} as const;
			} else {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			return {
				code: 200,
				body: combined,
				headers: {
					"cache-control": "max-age=1800",
				},
			} as const;
		},
	);
