import { createType, inject } from "@lppedd/di-wise-neo";
import type { Context, Handler, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { stream } from "hono/streaming";
import { Counter, Histogram } from "prom-client";

import { ConfigProvider } from "../../config";
import { logger as parentLogger } from "../../logger";
import { isNone, isSome } from "../../type/maybe";
import { progressively } from "../../utility/progressively";

import type { Introspection, IntrospectionRegistry } from ".";

const logger = parentLogger.child({ label: "introspection-mixin-hono" });

// biome-ignore lint/suspicious/noExplicitAny: mixin constructor definition
type Constructor = new (...args: any[]) => Introspection;

export interface IIntrospectionMixinHono {
	handler: {
		combined: () => Handler;
	} & Record<IntrospectionRegistry, () => Handler>;

	middleware(): MiddlewareHandler;
}

export const IIntrospectionMixinHono = createType<IIntrospectionMixinHono>(
	"IIntrospectionMixinHono",
);

type Authorization =
	| {
			authorized: true;
	  }
	| { authorized: false; response: (c: Context) => Response };

export function IntrospectionMixinHono(Base: Constructor) {
	class IntrospectionMixinHono extends Base implements IIntrospectionMixinHono {
		constructor(
			private configuration = inject(ConfigProvider)((c) => ({
				bearerToken: c.introspection.bearerToken,
				secure: c.secure,
			})),
		) {
			super();

			if (this.configuration.secure && isNone(this.configuration.bearerToken)) {
				logger.warn(
					"running securely with no provided introspection bearer token, metrics inaccessible",
				);
			}
		}

		private authorize(authorization: string | undefined): Authorization {
			if (isSome(this.configuration.bearerToken)) {
				// secure / insecure with configured token and valid authorization
				if (authorization === `Bearer ${this.configuration.bearerToken}`) {
					return { authorized: true };
				}

				return {
					authorized: false,
					response: (c: Context) => {
						// https://community.grafana.com/t/grafana-cloud-metrics-endpoint-error-for-wordpress-plugin/124359/6
						c.status(401);
						c.header("WWW-Authenticate", "Bearer");

						// secure / insecure with configured token and invalid authorization
						return c.text("not authorized");
					},
				};
			} else {
				// insecure without configured token
				if (!this.configuration.secure) {
					return { authorized: true };
				}

				return {
					authorized: false,
					response: (c: Context): Response => {
						// secure without configured token
						c.status(503);
						return c.text("not authorized");
					},
				};
			}
		}

		private handlerCombined(): Handler {
			return async (c) => {
				const authorization = this.authorize(c.req.header("Authorization"));
				if (!authorization.authorized) {
					return authorization.response(c);
				}

				// assumes that all registries emit prometheus-style metrics
				c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

				return stream(c, async (stream) => {
					for await (const metrics of progressively(
						Object.values(this.registries).map((registry) =>
							registry.metrics(),
						),
					)) {
						await stream.writeln(metrics);
					}
				});
			};
		}

		private handlerScoped(registry: IntrospectionRegistry): Handler {
			return async (c) => {
				const authorization = this.authorize(c.req.header("Authorization"));
				if (!authorization.authorized) {
					return authorization.response(c);
				}

				const scoped = this.registries[registry];

				c.header("Content-Type", scoped.contentType);
				return c.body(await scoped.metrics());
			};
		}

		handler = {
			combined: this.handlerCombined.bind(this),
			local: this.handlerScoped.bind(this, "local"),
			global: this.handlerScoped.bind(this, "global"),
		};

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

			this.registries.local.registerMetric(requestDuration);
			this.registries.local.registerMetric(requestsTotal);

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
