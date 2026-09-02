import type {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
} from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { HttpAdapterHost, Reflector } from "@nestjs/core";
import { Schema } from "effect/index";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { RouteSchemaMetadata } from "./route";

import type { HttpResponse } from "./http";
import type { RouteSchema } from "./schema";

const Response = Schema.Struct({
	body: Schema.optional(Schema.Unknown),
	code: Schema.Number,
	contentType: Schema.optional(Schema.String),
	headers: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
});
const isResponse = Schema.is(Response);

/** a `@Route` handler resolved to something other than an endpoint response */
export class EndpointResponseMalformedError extends Error {
	constructor(
		public route: RouteSchema,
		public result: unknown,
	) {
		super(
			`<${route.method} ${route.path}> did not resolve to an endpoint response`,
		);
		Object.setPrototypeOf(this, EndpointResponseMalformedError.prototype);
	}
}

/** unwraps the `{ code, contentType, body, headers }` union returned by `@Route` handlers into response */
@Injectable()
export class InterceptorEndpointResponse
	implements NestInterceptor<unknown, unknown>
{
	constructor(
		@Inject(Reflector) private readonly reflector: Reflector,
		@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
	) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler<unknown>,
	): Observable<unknown> {
		if (context.getType() !== "http") {
			return next.handle();
		}

		const route: RouteSchema | undefined = this.reflector.get(
			RouteSchemaMetadata,
			context.getHandler(),
		);
		if (typeof route === "undefined") {
			// not defined through `@Route`, skipping
			return next.handle();
		}

		const response = context.switchToHttp().getResponse<HttpResponse>();
		const { httpAdapter } = this.adapterHost;

		return next.handle().pipe(
			map((result) => {
				if (!isResponse(result)) {
					throw new EndpointResponseMalformedError(route, result);
				}

				for (const [name, value] of Object.entries(result.headers ?? {})) {
					if (value !== undefined) {
						httpAdapter.setHeader(response, name, String(value));
					}
				}

				const { contentType } = result;
				if (contentType !== undefined) {
					httpAdapter.setHeader(response, "content-type", contentType);
				}

				httpAdapter.status(response, result.code);
				return result.body;
			}),
		);
	}
}
