import { Schema } from "effect";
import type { PickDeep } from "type-fest";

import {
	DeviceCategoryIdValue,
	DeviceConnectivityValue,
} from "../../../service/derive/derivable/device";
import { idempotentEndpoint } from "../../base";

import type { Dependency } from "../../dependency";

const Parameters = Schema.Struct({
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
		}),
	),
});

export const getDimensions = (d: PickDeep<Dependency, "derivable.device">) =>
	idempotentEndpoint(
		"/api/unstable/dimensions",
		"get",
		Parameters,
		async ({
			query: {
				term,
				category: includeCategory,
				"!category": excludeCategory,
				connectivity: includeConnectivity,
				"!connectivity": excludeConnectivity,
				manufacturer: includeManufacturer,
				"!manufacturer": excludeManufacturer,
			},
		}) => {
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
			return {
				code: 200,
				body: await d.derivable.device.filters(query),
				headers: {
					"cache-control": "max-age=1800",
				},
			} as const;
		},
	);
