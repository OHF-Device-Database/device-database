import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";

import { RequestStorage, requestStorage } from "../utility/request-storage";

import type { paths } from "../schema";

type IdempotentHttpMethod = "get";
type EffectfulHttpMethod = "put" | "patch" | "post" | "delete";

export const NoParameters = Schema.Struct({});
export const NoRequestBody = Schema.Struct({});

export type EndpointRequest<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = ("parameters" extends keyof paths[Path][Method]
	? paths[Path][Method]["parameters"] extends Record<string, never>
		? { parameters?: paths[Path][Method]["parameters"] }
		: { parameters: paths[Path][Method]["parameters"] }
	: never) &
	("requestBody" extends keyof paths[Path][Method]
		? paths[Path][Method]["requestBody"] extends never | undefined
			? { requestBody?: paths[Path][Method]["requestBody"] }
			: {
					requestBody: "content" extends keyof paths[Path][Method]["requestBody"]
						? paths[Path][Method]["requestBody"]["content"][keyof paths[Path][Method]["requestBody"]["content"]]
						: never;
				}
		: never);

type EndpointResponses<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "responses" extends keyof paths[Path][Method]
	? paths[Path][Method]["responses"]
	: never;

export type EndpointResponse<
	Path extends keyof paths,
	Method extends keyof paths[Path],
	Code extends keyof ("responses" extends keyof paths[Path][Method]
		? paths[Path][Method]["responses"]
		: never),
> = "responses" extends keyof paths[Path][Method]
	? Code extends keyof paths[Path][Method]["responses"]
		? "content" extends keyof paths[Path][Method]["responses"][Code]
			? {
					code: Code;
					body: paths[Path][Method]["responses"][Code]["content"][keyof paths[Path][Method]["responses"][Code]["content"]];
				} & ("headers" extends keyof paths[Path][Method]["responses"][Code]
					? // only require `headers` to be specified if it has at least one member
						paths[Path][Method]["responses"][Code]["headers"] extends
							| Record<string, unknown>
							| undefined
						? { headers?: paths[Path][Method]["responses"][Code]["headers"] }
						: { headers: paths[Path][Method]["responses"][Code]["headers"] }
					: never)
			: never
		: never
	: never;

// OpenAPI spec can specify arbitrary types for parameters, but parsing will always yield strings
type StringParameters<P> = {
	[T in keyof P]: {
		[N in keyof P[T]]: string;
	};
};

export type DecoratedHandler<H> = {
	for: {
		path: string;
		method: string;
		handler: H;
	};
	router: Hono;
};

// OpenAPI path parameters are wrapped in curly braces, but Hono expects `:<parameter-name>`
const pathParameter = /(?:{(?<parameter>\w+)})/g;

export const idempotentEndpoint = <
	Path extends keyof paths,
	Method extends keyof Pick<paths[Path], IdempotentHttpMethod>,
	Parameters extends EndpointRequest<
		Path,
		Method
	>["requestBody"] extends undefined
		? EndpointRequest<Path, Method>["parameters"]
		: never,
	Code extends keyof EndpointResponses<Path, Method>,
	P extends Schema.Any,
>(
	path: Path,
	method: Method,
	parameters: Record<string, undefined> extends Parameters
		? typeof NoParameters
		: Schema.Schema.Encoded<P> extends StringParameters<Parameters>
			? P
			: never,
	handler: (
		parameters: Schema.Schema.Type<P>,
	) => Promise<
		Code extends number ? EndpointResponse<Path, Method, Code> : never
	>,
): DecoratedHandler<typeof handler> => {
	const router = new Hono();

	const substitutedPath = path.replaceAll(pathParameter, ":$<parameter>");

	router.get(substitutedPath, async (c) => {
		const receivedParameters = {
			query: c.req.query(),
			path: c.req.param(),
			header: c.req.header(),
		};

		// biome-ignore lint/suspicious/noExplicitAny: inferred `Any` / `Schema<{}>` contradict each other
		const decodedParameters = Schema.decodeUnknownEither(parameters as any)(
			receivedParameters,
		);
		if (isLeft(decodedParameters)) {
			return c.text(decodedParameters.left.message, 400);
		}

		const response = await requestStorage.run(
			// use store created by middleware and create new store for SSR
			requestStorage.getStore() ?? new RequestStorage(),
			async () => {
				// biome-ignore lint/suspicious/noExplicitAny: types are checked above
				return await handler(decodedParameters.right as any);
			},
		);

		c.status(response.code as StatusCode);

		if ("headers" in response && typeof response.headers !== "undefined") {
			const headers = response.headers as Record<string, string | string[]>;
			for (const [key, value] of Object.entries(headers)) {
				if (typeof value === "undefined") {
					continue;
				}

				if (!Array.isArray(value)) {
					c.header(key, value);
				} else {
					for (const item of value) {
						c.header(key, item);
					}
				}
			}
		}

		if (typeof response.body === "object") {
			return c.json(response.body);
		} else {
			return c.text(`${response.body}`);
		}
	});

	return { router, for: { path, method, handler: handler } };
};

export const effectfulEndpoint = <
	Path extends keyof paths,
	Method extends keyof Pick<paths[Path], EffectfulHttpMethod>,
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	RequestBody extends EndpointRequest<Path, Method>["requestBody"],
	Code extends keyof EndpointResponses<Path, Method>,
	P extends Schema.Any,
	RB extends Schema.Any,
>(
	path: Path,
	method: Method,
	parameters: Record<string, undefined> extends Parameters
		? typeof NoParameters
		: Schema.Schema.Encoded<P> extends StringParameters<Parameters>
			? P
			: never,
	requestBody: Record<string, undefined> extends RequestBody
		? typeof NoRequestBody
		: Schema.Schema.Encoded<RB> extends RequestBody
			? RB
			: never,
	handler: (
		parameters: Schema.Schema.Type<P>,
		requestBody: Schema.Schema.Type<RB>,
	) => Promise<
		Code extends number ? EndpointResponse<Path, Method, Code> : never
	>,
): DecoratedHandler<typeof handler> => {
	const router = new Hono();

	const substitutedPath = path.replaceAll(pathParameter, ":$<parameter>");

	const route = router[method as EffectfulHttpMethod].bind(router);

	route(substitutedPath, async (c) => {
		const receivedParameters = {
			query: c.req.query(),
			path: c.req.param(),
			header: c.req.header(),
		};
		const receivedRequestBody = await c.req.json();

		// biome-ignore lint/suspicious/noExplicitAny: inferred `Any` / `Schema<{}>` contradict each other
		const decodedParameters = Schema.decodeUnknownEither(parameters as any)(
			receivedParameters,
		);
		if (isLeft(decodedParameters)) {
			return c.text(decodedParameters.left.message, 400);
		}

		// biome-ignore lint/suspicious/noExplicitAny: inferred `Any` / `Schema<{}>` contradict each other
		const decodedRequestBody = Schema.decodeUnknownEither(requestBody as any)(
			receivedRequestBody,
		);
		if (isLeft(decodedRequestBody)) {
			return c.text(decodedRequestBody.left.message, 400);
		}

		const response = await requestStorage.run(
			// use store created by middleware and create new store for SSR
			requestStorage.getStore() ?? new RequestStorage(),
			async () => {
				return await handler(
					// biome-ignore lint/suspicious/noExplicitAny: types are checked above
					decodedParameters.right as any,
					// biome-ignore lint/suspicious/noExplicitAny: types are checked above
					decodedRequestBody.right as any,
				);
			},
		);

		c.status(response.code as StatusCode);

		if ("headers" in response && typeof response.headers !== "undefined") {
			const headers = response.headers as Record<string, string | string[]>;
			for (const [key, value] of Object.entries(headers)) {
				if (typeof value === "undefined") {
					continue;
				}

				if (!Array.isArray(value)) {
					c.header(key, value);
				} else {
					for (const item of value) {
						c.header(key, item);
					}
				}
			}
		}

		if (typeof response.body === "object") {
			return c.json(response.body);
		} else {
			return c.text(`${response.body}`);
		}
	});

	return { router, for: { path, method, handler: handler } };
};
