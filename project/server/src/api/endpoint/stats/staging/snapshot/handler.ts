import { idempotentEndpoint, NoParameters } from "../../../../base";

import type { Dependency } from "../../../../dependency";

export const getStatsStagingSnapshot = (d: Pick<Dependency, "snapshot">) =>
	idempotentEndpoint(
		"/api/v1/stats/staging/snapshot",
		"get",
		NoParameters,
		async () => {
			return {
				code: 200,
				body: {
					submissions: await d.snapshot.staging.stats.submissions(),
					devices: await d.snapshot.staging.stats.devices(),
					devicePermutations:
						await d.snapshot.staging.stats.devicePermutations(),
					entities: await d.snapshot.staging.stats.entities(),
				},
			} as const;
		},
	);
