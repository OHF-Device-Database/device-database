import { createType, inject } from "@lppedd/di-wise-neo";
import type { Handler, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { Counter, Histogram } from "prom-client";

import { ConfigProvider } from "../../config";
import { logger as parentLogger } from "../../logger";
import { isNone, isSome } from "../../type/maybe";

import type { Introspection } from ".";

const logger = parentLogger.child({ label: "introspection-mixin-hono" });

// biome-ignore lint/suspicious/noExplicitAny: mixin constructor definition
type Constructor = new (...args: any[]) => Introspection;

export interface IIntrospectionMixinHono {
	handler(): Handler;
	middleware(): MiddlewareHandler;
}

export const IIntrospectionMixinHono = createType<IIntrospectionMixinHono>(
	"IIntrospectionMixinHono",
);

export function IntrospectionMixinHono(Base: Constructor) {
	class IntrospectionMixinHono extends Base implements IIntrospectionMixinHono {
		constructor(
			private configuration = inject(ConfigProvider)((c) => ({
				bearerToken: c.introspection.bearerToken,
				secure: c.secure,
			})),
		) {
			super();
		}

		handler(): Handler {
			if (this.configuration.secure && isNone(this.configuration.bearerToken)) {
				logger.warn(
					"running securely with no provided introspection bearer token, metrics inaccessible",
				);
			}

			return async (c) => {
				seal: {
					const authorization = c.req.header("Authorization");
					if (isSome(this.configuration.bearerToken)) {
						// secure / insecure with configured token and valid authorization
						if (authorization === `Bearer ${this.configuration.bearerToken}`) {
							break seal;
						}

						// secure / insecure with configured token and invalid authorization
						c.status(404);
						return c.text("not authorized");
					} else {
						// insecure without configured token
						if (!this.configuration.secure) {
							break seal;
						}

						// secure without configured token
						c.status(404);
						return c.text("not authorized");
					}
				}

				const metrics = await this.registry.metrics();
				c.header("Content-Type", this.registry.contentType);
				return c.body(metrics);
			};
		}

		middleware(): MiddlewareHandler {
			const requestDuration = new Histogram({
				name: "http_request_duration_seconds",
				help: "Duration of HTTP requests in seconds",
				labelNames: ["method", "status", "ok", "route"] as const,
				// https://opentelemetry.io/docs/specs/semconv/http/http-metrics/#metric-httpserverrequestduration
				buckets: [
					0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5,
					10,
				],
			});

			const requestsTotal = new Counter({
				name: "http_requests_total",
				help: "Total number of HTTP requests",
				labelNames: ["method", "status", "ok", "route"] as const,
			});

			this.registry.registerMetric(requestDuration);
			this.registry.registerMetric(requestsTotal);

			return createMiddleware(async (c, next) => {
				const timer = requestDuration.startTimer();

				try {
					await next();
				} finally {
					const labels = {
						method: c.req.method,
						route: routePath(c),
						status: c.res.status.toString(),
						ok: String(c.res.ok),
					} as const;

					timer(labels);
					requestsTotal.inc(labels);
				}
			});
		}
	}

	return IntrospectionMixinHono;
}
