import type { PickDeep } from "type-fest";

import categories from "../../../categories.json" with { type: "json" };
import { unroll } from "../../../utility/iterable";
import { idempotentEndpoint, NoParameters } from "../../base";

import type { Dependency } from "../../dependency";

export const getDimensions = (d: PickDeep<Dependency, "derivable.device">) =>
	idempotentEndpoint(
		"/api/unstable/dimensions",
		"get",
		NoParameters,
		async () => {
			const manufacturers = (
				await unroll(d.derivable.device.manufacturers())
			).map((item) => item[0]);

			return {
				code: 200,
				body: {
					manufacturers,
					connectivity: ["online", "offline"] as const,
					categories,
				},
				headers: {
					"cache-control": "max-age=1800",
				},
			} as const;
		},
	);
