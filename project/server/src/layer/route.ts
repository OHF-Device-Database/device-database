import type { ExecutionContext } from "@nestjs/common";
import {
	createParamDecorator,
	Delete,
	Get,
	Patch,
	Post,
	Put,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Schema } from "effect";

import type { paths } from "../schema";
import type {
	_Codec,
	_EndpointResponse,
	_MethodKeyOf,
	HandlerArguments,
	HttpMethod,
	RouteCodec,
	RouteSchema,
} from "./schema";

/** metadata key used by response interceptor to indicate that a route was registered through {@link Route} */
export const RouteSchemaMetadata = Reflector.createDecorator<RouteSchema>({
	key: "route:schema",
});

/** metadata key used by request interceptor to retrieve codecs */
export const RouteCodecMetadata = Reflector.createDecorator<RouteCodec>({
	key: "route:codec",
});

/** where the request interceptor leaves what it decoded */
export const ROUTE_DECODED = Symbol("route:decoded");

/** section of a request the codec decodes */
export type DecodedSection = "parameters" | "requestBody";

/** a platform request the request interceptor has decoded onto */
export type DecodedRequest = {
	[ROUTE_DECODED]?: {
		readonly [Section in DecodedSection]: unknown;
	};
};

/** picks up decoded parameters from where interceptor left them to be used as handler function parameters */
const DecodedParameter = createParamDecorator(
	(section: DecodedSection, context: ExecutionContext) =>
		context.switchToHttp().getRequest<DecodedRequest>()[ROUTE_DECODED]?.[
			section
		],
);

const NEST_ROUTE = {
	get: Get,
	put: Put,
	post: Post,
	patch: Patch,
	delete: Delete,
} as const satisfies Record<HttpMethod, (path?: string) => MethodDecorator>;

/** `{id}` → `:id` */
const toPath = (path: string): string => path.replace(/\{([^}]+)\}/gu, ":$1");

/**
 * unbound schema guard for `@Get()` / `@Post()` / ...
 *
 * type inference fails when not bound explicitly
 * ```typescript
 * // bind explicitly before using as decorator
 * const Route = _Route<paths>();
 * ````
 *
 * @param method http method
 * @param path schema path
 * @param codec {@link _Codec}
 */
export const _Route =
	<Paths>() =>
	<
		Path extends keyof Paths,
		Method extends _MethodKeyOf<Paths, Path>,
		CodecParameters extends Schema.Schema.AnyNoContext,
		CodecRequestBody extends Schema.Schema.AnyNoContext,
	>(
		method: Method,
		path: Path,
		codec?: _Codec<Paths, Path, Method, CodecParameters, CodecRequestBody>,
	) =>
	<
		Handler extends (
			...args: HandlerArguments<CodecParameters, CodecRequestBody>
		) =>
			| _EndpointResponse<Paths, Path, Method>
			| Promise<_EndpointResponse<Paths, Path, Method>>,
	>(
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<Handler>,
	): void => {
		const untyped = descriptor as TypedPropertyDescriptor<unknown>;

		const parameters = codec?.parameters as
			| Schema.Schema.AnyNoContext
			| undefined;
		const requestBody = codec?.requestBody as
			| Schema.Schema.AnyNoContext
			| undefined;
		if (
			typeof parameters !== "undefined" ||
			typeof requestBody !== "undefined"
		) {
			RouteCodecMetadata({ parameters, requestBody })(
				target,
				propertyKey,
				untyped,
			);
		}

		// enables accessing decoded parameters / request body through handle function parameters
		if (typeof parameters !== "undefined") {
			DecodedParameter("parameters")(target, propertyKey, 0);
		}
		if (typeof requestBody !== "undefined") {
			DecodedParameter("requestBody")(target, propertyKey, 1);
		}

		NEST_ROUTE[String(method) as HttpMethod](toPath(String(path)))(
			target,
			propertyKey,
			untyped,
		);
		RouteSchemaMetadata({
			path: String(path),
			method: String(method),
		})(target, propertyKey, untyped);
	};

/**
 * schema guard for `@Get()` / `@Post()` / ...
 *
 * @param method http method
 * @param path schema path
 * @param codec {@link _Codec}
 */
export const Route = _Route<paths>();
