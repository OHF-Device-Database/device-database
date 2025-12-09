import { idempotentEndpoint, NoParameters } from "../../base";

import type { Dependency } from "../../dependency";

export const getHealth = (d: Pick<Dependency, "database">) =>
	idempotentEndpoint("/api/v1/health", "get", NoParameters, async () => {
		await d.database.assertHealthy();

		return {
			code: 200,
			body: "ok",
		} as const;
	});
