import { hrtime } from "node:process";

import { createMiddleware } from "hono/factory";

import { logger as parentLogger } from "../../logger";
import { formatNs } from "../../utility/format";

import type { MiddlewareRequestStorageVariables } from "./request-storage";

export type MiddlewareRequestStartVariables = {
	start: bigint;
};

const logger = parentLogger.child({ label: "api" });

export const middlewareRequestLog = createMiddleware<{
	Variables: MiddlewareRequestStartVariables &
		MiddlewareRequestStorageVariables;
}>(async (c, next) => {
	c.set("start", hrtime.bigint());

	const request = {
		path: c.req.path,
		method: c.req.method,
		request: c.var.requestId,
	};

	logger.info("(←) req", request);

	await next();

	const statusCode = c.res.status;
	const took = hrtime.bigint() - c.var.start;

	const response = {
		statusCode,
		request: c.var.requestId,
		took,
	};

	if (statusCode >= 400 && statusCode < 500) {
		logger.warn("client error", response);
	} else if (statusCode >= 500 && statusCode < 600) {
		logger.error("server error", response);
	} else {
		logger.info(`(→) res in ${formatNs(took)}s`, response);
	}
});
