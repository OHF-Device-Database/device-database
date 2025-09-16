import { idempotentEndpoint, NoParameters } from "../../base";

export const getHealth = () =>
	idempotentEndpoint("/api/v1/health", "get", NoParameters, async () => {
		return {
			code: 200,
			body: "ok",
		} as const;
	});
