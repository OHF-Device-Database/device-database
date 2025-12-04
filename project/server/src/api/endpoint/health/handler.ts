import { idempotentEndpoint, NoParameters } from "../../base";

import type { Dependency } from "../../dependency";

export const getHealth = (d: Pick<Dependency, "introspection">) =>
	idempotentEndpoint("/api/v1/health", "get", NoParameters, async () => {
		await d.introspection.assertHealthy();

		return {
			code: 200,
			body: "ok",
		} as const;
	});
