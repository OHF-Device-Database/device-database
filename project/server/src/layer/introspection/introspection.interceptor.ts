import type {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
} from "@nestjs/common";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { HttpAdapterHost, Reflector } from "@nestjs/core";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { RouteSchemaMetadata } from "../route";
import { ServiceIntrospection } from "./introspection.service";

import type {
	IntrospectionMetricCounter,
	IntrospectionMetricHistogram,
} from "../../service/introspect";
import type { RouteSchema } from "../schema";

type Labels = Record<"method" | "status" | "ok" | "route", string>;

/** records request duration and count of every route the application serves */
@Injectable()
export class InterceptorIntrospection implements NestInterceptor {
	private readonly requestDuration: IntrospectionMetricHistogram<Labels>;
	private readonly requestsTotal: IntrospectionMetricCounter<Labels>;

	constructor(
		@Inject(ServiceIntrospection) introspection: ServiceIntrospection,
		@Inject(Reflector) private readonly reflector: Reflector,
		@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
	) {
		this.requestDuration = introspection.metric.histogram({
			name: "http_request_duration_seconds",
			help: "Duration of HTTP requests in seconds",
			labelNames: ["method", "status", "ok", "route"],
			registry: "local",
			// https://opentelemetry.io/docs/specs/semconv/http/http-metrics/#metric-httpserverrequestduration
			buckets: [
				0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5,
				10,
			],
		});

		this.requestsTotal = introspection.metric.counter({
			name: "http_requests_total",
			help: "Total number of HTTP requests",
			labelNames: ["method", "status", "ok", "route"],
			registry: "local",
		});
	}

	intercept(
		context: ExecutionContext,
		next: CallHandler<unknown>,
	): Observable<unknown> {
		if (context.getType() !== "http") {
			return next.handle();
		}

		// the schema path is the only low cardinality route label available:
		// → params are kept in their `{id}` form
		const route: RouteSchema | undefined = this.reflector.get(
			RouteSchemaMetadata,
			context.getHandler(),
		);
		if (typeof route === "undefined") {
			// not defined through `@Route`, skipping
			return next.handle();
		}

		const http = context.switchToHttp();
		const method = this.adapterHost.httpAdapter.getRequestMethod(
			http.getRequest(),
		);
		const started = performance.now();

		const record = (status: number): void => {
			const labels = {
				method,
				route: route.path,
				status: status.toString(),
				ok: String(status >= 200 && status < 300),
			} as const;

			this.requestDuration.observe(
				labels,
				(performance.now() - started) / 1000,
			);
			this.requestsTotal.increment(labels);
		};

		return next.handle().pipe(
			tap({
				next: () => {
					// set by `InterceptorEndpointResponse`, or by the adapter's default
					const { statusCode } = http.getResponse<{ statusCode: number }>();
					record(statusCode);
				},
				error: (error: unknown) => {
					record(error instanceof HttpException ? error.getStatus() : 500);
				},
			}),
		);
	}
}
