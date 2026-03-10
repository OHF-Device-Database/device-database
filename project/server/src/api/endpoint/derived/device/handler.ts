import { idempotentEndpoint, NoParameters } from "../../../base";

import type { IDeriveDerivableDevice } from "../../../../service/derive/derivable/device";

const wrap = (iterable: ReturnType<IDeriveDerivableDevice["devices"]>) => {
	return (async function* _() {
		for await (const device of iterable) {
			const independent = {
				id: device.id,
				integration: device.integration,
				manufacturer: device.manufacturer,
				count: device.count,
			} as const;

			if (
				typeof device.model !== "undefined" &&
				typeof device.modelId !== "undefined"
			) {
				yield {
					...independent,
					model: device.model,
					model_id: device.modelId,
				};
			} else if (
				typeof device.model !== "undefined" &&
				typeof device.modelId === "undefined"
			) {
				yield {
					...independent,
					model: device.model,
				};
			} else if (
				typeof device.model === "undefined" &&
				typeof device.modelId !== "undefined"
			) {
				yield {
					...independent,
					model_id: device.modelId,
				};
			}
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
