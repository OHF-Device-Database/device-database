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
				d.snapshot.self.staging.stats.submissions(),
				d.snapshot.self.staging.stats.devices(),
				d.snapshot.self.staging.stats.devicePermutations(),
				d.snapshot.self.staging.stats.entities(),
				d.snapshot.self.staging.stats.integrations(),
				d.snapshot.self.staging.stats.subjects(),
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
