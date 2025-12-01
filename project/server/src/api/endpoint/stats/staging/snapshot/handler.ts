import { idempotentEndpoint, NoParameters } from "../../../../base";

import type { Dependency } from "../../../../dependency";

export const getStatsStagingSnapshot = (d: Pick<Dependency, "snapshot">) =>
	idempotentEndpoint(
		"/api/v1/stats/staging/snapshot",
		"get",
		NoParameters,
		async () => {
			const [
				submissions,
				devices,
				devicePermutations,
				entities,
				integrations,
				subjects,
			] = await Promise.all([
				d.snapshot.staging.stats.submissions(),
				d.snapshot.staging.stats.devices(),
				d.snapshot.staging.stats.devicePermutations(),
				d.snapshot.staging.stats.entities(),
				d.snapshot.staging.stats.integrations(),
				d.snapshot.staging.stats.subjects(),
			]);

			return {
				code: 200,
				body: {
					submissions,
					devices,
					devicePermutations,
					entities,
					integrations,
					subjects,
				},
			} as const;
		},
	);
