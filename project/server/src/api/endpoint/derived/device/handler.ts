import { Schema } from "effect";

import { Uuid } from "../../../../type/codec/uuid";
import { isNone } from "../../../../type/maybe";
import { idempotentEndpoint, NoParameters } from "../../../base";

import type { IDeriveDerivableDevice } from "../../../../service/derive/derivable/device";

const DeviceModel = Schema.Union(
	Schema.Struct({
		model: Schema.String,
		model_id: Schema.String,
	}),
	Schema.Struct({
		model: Schema.optional(Schema.String),
		model_id: Schema.String,
	}),
	Schema.Struct({
		model: Schema.String,
		model_id: Schema.optional(Schema.String),
	}),
);

const wrap = (iterable: ReturnType<IDeriveDerivableDevice["devices"]>) => {
	const guard = Schema.is(DeviceModel);

	return (async function* _() {
		for await (const device of iterable) {
			const wrapped = {
				id: device.id,
				integration: device.integration,
				manufacturer: device.manufacturer,
				count: device.count,
				model: device.model ?? undefined,
				model_id: device.modelId ?? undefined,
			};

			if (!guard(wrapped)) {
				continue;
			}

			yield wrapped;
		}
	})();
};

export const getDerivedDevices = (d: {
	derivable: { device: IDeriveDerivableDevice };
}) =>
	idempotentEndpoint(
		"/api/unstable/derived/devices",
		"get",
		NoParameters,
		async () => {
			return {
				code: 200,
				body: wrap(d.derivable.device.devices()),
				headers: {
					"cache-control": "max-age=1800",
				},
			} as const;
		},
	);

const Parameters = Schema.Struct({
	path: Schema.Struct({
		id: Uuid,
	}),
});

export const getDerivedDevice = (d: {
	derivable: { device: IDeriveDerivableDevice };
}) => {
	const guard = Schema.is(DeviceModel);

	return idempotentEndpoint(
		"/api/unstable/derived/devices/{id}",
		"get",
		Parameters,
		async ({ path: { id } }) => {
			const device = await d.derivable.device.device(id);
			if (isNone(device)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			const wrapped = {
				id: device.id,
				integration: device.integration,
				manufacturer: device.manufacturer,
				count: device.count,
				model: device.model ?? undefined,
				model_id: device.modelId ?? undefined,
			};

			if (!guard(wrapped)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			return {
				code: 200,
				body: wrapped,
				headers: {
					"cache-control": "max-age=604800, immutable",
				},
			} as const;
		},
	);
};
