import type {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
} from "@nestjs/common";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Schema } from "effect";
import { isLeft } from "effect/Either";
import type { Observable } from "rxjs";

import { ROUTE_DECODED, RouteCodecMetadata } from "./route";

import type { RouteCodec } from "./schema";

/** the parts of the platform request a codec is applied to */
type RequestLike = {
	readonly params?: unknown;
	readonly query?: unknown;
	readonly headers?: Readonly<Record<string, unknown>>;
	readonly body?: unknown;
};

const requestParameters = (
	request: RequestLike,
): Readonly<Record<string, unknown>> => ({
	path: request.params ?? {},
	query: request.query ?? {},
	header: request.headers ?? {},
});

const decode = (
	schema: Schema.Schema.AnyNoContext,
	section: string,
	value: unknown,
): unknown => {
	const decoded = Schema.decodeUnknownEither(schema)(value);
	if (isLeft(decoded)) {
		throw new BadRequestException(
			`invalid ${section}: ${decoded.left.message}`,
		);
	}

	return decoded.right;
};

/** decodes what a `@Route` declares a codec for, before the handler is entered */
@Injectable()
export class InterceptorRouteRequest implements NestInterceptor {
	constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler<unknown>,
	): Observable<unknown> {
		if (context.getType() !== "http") {
			return next.handle();
		}

		// absent on any handler that is not a `@Route`, and ones that don't declares schemas
		const codec: RouteCodec | undefined = this.reflector.get(
			RouteCodecMetadata,
			context.getHandler(),
		);
		if (typeof codec === "undefined") {
			return next.handle();
		}

		const request = context.switchToHttp().getRequest();

		request[ROUTE_DECODED] = {
			parameters:
				codec.parameters === undefined
					? undefined
					: decode(codec.parameters, "parameters", requestParameters(request)),
			requestBody:
				codec.requestBody === undefined
					? undefined
					: decode(codec.requestBody, "request body", request.body),
		};

		return next.handle();
	}
}
