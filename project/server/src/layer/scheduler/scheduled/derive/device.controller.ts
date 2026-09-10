import { Controller, Inject } from "@nestjs/common";
import { Schema } from "effect";

import integrations from "../../../../categorized-integrations.json";
import { logger as parentLogger } from "../../../../logger";
import {
	DeviceCategoryIdValue,
	DeviceConnectivityValue,
	type SchedulerScheduledDeriveDeviceDeviceMono,
} from "../../../../service/scheduler/scheduled/derive/device";
import { floor, Integer } from "../../../../type/codec/integer";
import { Uuid } from "../../../../type/codec/uuid";
import { isNone, isSome } from "../../../../type/maybe";
import { RequestPath } from "../../../http";
import { ServiceIngress } from "../../../ingress/ingress.service";
import { Route } from "../../../route";
import { ServiceSchedulerScheduledDeriveDevice } from "./device.service";

type Integration = keyof typeof integrations;

const logger = parentLogger.child({
	label: "controller-scheduler-scheduled-derive-device",
});

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
type ParametersDevices = typeof ParametersDevices.Type;

const ParametersDevice = Schema.Struct({
	path: Schema.Struct({
		id: Uuid,
	}),
});
type ParametersDevice = typeof ParametersDevice.Type;

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
type ParametersDeviceDuplicates = typeof ParametersDeviceDuplicates.Type;

const ParametersDimensions = Schema.Struct({
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
type ParametersDimensions = typeof ParametersDimensions.Type;

@Controller()
export class ControllerSchedulerScheduledDeriveDevice {
	constructor(
		@Inject(ServiceSchedulerScheduledDeriveDevice)
		private readonly service: ServiceSchedulerScheduledDeriveDevice,
		@Inject(ServiceIngress)
		private readonly ingress: ServiceIngress,
	) {}

	private static map(
		d: Omit<SchedulerScheduledDeriveDeviceDeviceMono, "duplicates">,
	) {
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
	}

	@Route("get", "/api/unstable/derived/devices", {
		parameters: ParametersDevices,
	})
	async devices(
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
		}: ParametersDevices,
		@RequestPath() path: string,
	) {
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

		const paginated = await this.ingress.paginate()({
			slice: ({ offset, limit }) =>
				this.service.devices.slice(query, { offset, limit }),
			count: async () => await this.service.devices.count(query),
		})({
			path,
			page,
			size,
		});

		const mapped = paginated.items.flatMap((device) => {
			const mapped = ControllerSchedulerScheduledDeriveDevice.map(device);
			return isSome(mapped)
				? [
						{
							...mapped,
							id: device.id,
							url: this.ingress.url.device.self(device.id).toString(),
							duplicates: device.duplicates.map((id) => ({
								id,
								url: this.ingress.url.device.self(id).toString(),
							})),
						},
					]
				: [];
		});

		return {
			code: 200,
			body: mapped,
			contentType: "application/json",
      headers: {
        "access-control-expose-headers": "content-range, link",
				"cache-control": "max-age=1800",
				...paginated.headers,
			},
		} as const;
	}

	@Route("get", "/api/unstable/derived/devices/{id}", {
		parameters: ParametersDevice,
	})
	async device({ path: { id } }: ParametersDevice) {
		const result = await this.service.device({ id });
		if (isNone(result)) {
			return {
				code: 404,
				body: "not found",
			} as const;
		}

		const device = ControllerSchedulerScheduledDeriveDevice.map(result);
		if (isNone(device)) {
			return {
				code: 404,
				body: "not found",
			} as const;
		}

		const query = { canonical: new Set([id]) };

		const paginated = await this.ingress.paginate()({
			slice: ({ offset, limit }) =>
				this.service.devices.slice(query, { offset, limit }),
			count: async () => await this.service.devices.count(query),
		})({
			path: this.ingress.url.device.duplicates(id),
			page: floor(0),
			size: undefined,
		});

		return {
			code: 200,
			contentType: "application/json",
			body: {
				...device,
				duplicates: {
					items: paginated.items.flatMap((device) => {
						const mapped = ControllerSchedulerScheduledDeriveDevice.map(device);
						return isSome(mapped)
							? [
									{
										...mapped,
										id: device.id,
										url: this.ingress.url.device.self(device.id).toString(),
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
	}

	@Route("get", "/api/unstable/derived/devices/{id}/duplicates", {
		parameters: ParametersDeviceDuplicates,
	})
	async deviceDuplicates(
		{ path: { id }, query: { page, size } }: ParametersDeviceDuplicates,
		@RequestPath() path: string,
	) {
		const result = await this.service.device({ id });
		if (isNone(result)) {
			return {
				code: 404,
				body: "not found",
			} as const;
		}

		const query = {
			canonical: new Set([id]),
		};

		const paginated = await this.ingress.paginate()({
			slice: ({ offset, limit }) =>
				this.service.devices.slice(query, { offset, limit }),
			count: async () => await this.service.devices.count(query),
		})({
			path,
			page,
			size,
		});

		const mapped = paginated.items.flatMap((device) => {
			const mapped = ControllerSchedulerScheduledDeriveDevice.map(device);
			return isSome(mapped)
				? [
						{
							...mapped,
							id: device.id,
							url: this.ingress.url.device.self(device.id).toString(),
						},
					]
				: [];
		});

		return {
			code: 200,
			body: mapped,
			contentType: "application/json",
			headers: {
				"cache-control": "max-age=1800",
				...paginated.headers,
			},
		} as const;
	}

	@Route("get", "/api/unstable/dimensions", {
		parameters: ParametersDimensions,
	})
	async dimensions({
		query: {
			term,
			category: includeCategory,
			"!category": excludeCategory,
			connectivity: includeConnectivity,
			"!connectivity": excludeConnectivity,
			manufacturer: includeManufacturer,
			"!manufacturer": excludeManufacturer,
		},
	}: ParametersDimensions) {
		const query = {
			term,
			canonical: true,
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
			body: await this.service.filters(query),
			contentType: "application/json",
			headers: {
				"cache-control": "max-age=1800",
			},
		} as const;
	}
}
