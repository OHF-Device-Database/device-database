import { Schema } from "effect";

import { Uuid } from "../../../type/codec/uuid";
import { isNone } from "../../../type/maybe";
import { idempotentEndpoint } from "../../base";

import type { Dependency } from "../../dependency";

const Parameters = Schema.Struct({
	path: Schema.Struct({
		id: Uuid,
	}),
});

export const getDevice = (d: Pick<Dependency, "snapshot">) =>
	idempotentEndpoint(
		"/api/unstable/devices/{id}",
		"get",
		Parameters,
		async ({ path: { id } }) => {
			const device = await d.snapshot.self.staging.device({ id });
			if (isNone(device)) {
				return {
					code: 404,
					body: "not found",
				} as const;
			}

			return {
				code: 200,
				body: {
					integration: device.integration,
					manufacturer: device.manufacturer,
					model: device.model,
					model_id: device.modelId,
				},
			} as const;
		},
	);
