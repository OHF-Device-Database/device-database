import { parse } from "node:querystring";
import { Readable } from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { StatusCode } from "hono/utils/http-status";
import type { ReadonlyDeep } from "type-fest";

import { isNone } from "../type/maybe";
import { RequestStorage, requestStorage } from "../utility/request-storage";
import { ArrayTransform } from "./utility";

import type { paths } from "../schema";

type IdempotentHttpMethod = "get";
type EffectfulHttpMethod = "put" | "patch" | "post" | "delete";

type EffectfulEndpointContext = {
	raw: {
		requestBody: boolean;
	};
};

type RequestBodyContentType =
	| "text/plain"
	| "application/json"
	| "application/x-www-form-urlencoded";

export const NoParameters = Symbol("NoParameters");
type NoParameters = typeof NoParameters;
export const NoRequestBody = Symbol("NoRequestBody");
type NoRequestBody = typeof NoRequestBody; // only support parameter types that extend string (additionally enforced by schema linter)

// https://github.com/openapi-ts/openapi-typescript/issues/2457
type LaxOptionalProperty<T> =
	T extends Record<string, unknown>
		? {
				[K in keyof T]: Omit<T, K> extends T
					? LaxOptionalProperty<T[K]> | undefined
					: LaxOptionalProperty<T[K]>;
			}
		: T;

type ParametersShape = {
	query?: Record<string, string | string[] | undefined>;
	header?: Record<string, string | undefined>;
	path?: Record<string, string | undefined>;
	cookie?: Record<string, string | undefined>;
};
type Parameters<T extends ParametersShape> = ReadonlyDeep<
	LaxOptionalProperty<T>
>;
type EndpointRequestParameters<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "parameters" extends keyof paths[Path][Method]
	? paths[Path][Method]["parameters"] extends Record<string, never>
		? { parameters?: paths[Path][Method]["parameters"] }
		: // only support parameter types that extend string
			// additionally enforced by schema linter
			{
				parameters: Parameters<
					paths[Path][Method]["parameters"] extends ParametersShape
						? paths[Path][Method]["parameters"]
						: never
				>;
			}
	: never;
type EndpointRequestRequestBody<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "requestBody" extends keyof paths[Path][Method]
	? paths[Path][Method]["requestBody"] extends never | undefined
		? { requestBody?: paths[Path][Method]["requestBody"] }
		: "content" extends keyof paths[Path][Method]["requestBody"]
			? {
					requestBody: {
						[CT in keyof paths[Path][Method]["requestBody"]["content"]]: {
							kind: CT;
							body: paths[Path][Method]["requestBody"]["content"][CT];
						};
					}[keyof paths[Path][Method]["requestBody"]["content"]];
				}
			: never
	: never;
type EndpointRequest<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = EndpointRequestParameters<Path, Method> &
	EndpointRequestRequestBody<Path, Method>;
type EndpointResponses<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "responses" extends keyof paths[Path][Method]
	? paths[Path][Method]["responses"]
	: never;

type Body<T> =
	T extends Array<infer R>
		? T | AsyncIterable<LaxOptionalProperty<R>>
		: LaxOptionalProperty<T>;

// only requires headers to be specified if it has at least one member
type Headers<T> =
	{ [H in keyof T as unknown extends T[H] ? never : H]: T[H] } extends Record<
		string,
		never
	>
		? { headers?: T }
		: { headers: T };

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

					body: Body<
						paths[Path][Method]["responses"][Code]["content"][keyof paths[Path][Method]["responses"][Code]["content"]]
					>;
				} & ("headers" extends keyof paths[Path][Method]["responses"][Code]
					? // only require `headers` to be specified if it has at least one member
						Headers<paths[Path][Method]["responses"][Code]["headers"]>
					: never)
			: never
		: never
	: never;

export type DecoratedHandler<H> = {
	for?: {
		path: string;
		method: string;
		handler: H;
	};
	router: Hono;
};

// OpenAPI path parameters are wrapped in curly braces, but Hono expects `:<parameter-name>`
const pathParameter = /(?:{(?<parameter>\w+)})/g;

/** lifts out sole element of value */
const collapseQueries = (
	queries: Record<string, readonly string[]>,
): Record<string, string | readonly string[]> =>
	Object.fromEntries(
		Object.entries(queries).flatMap(([key, value]) =>
			Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
		),
	);

// TODO: test
/* node:coverage disable */
export const idempotentEndpoint = <
	Path extends keyof paths,
	Method extends keyof {
		[Method in keyof Pick<
			paths[Path],
			IdempotentHttpMethod
		> as paths[Path][Method] extends undefined ? never : Method]: never;
	} &
		string,
	Parameters extends EndpointRequest<Path, Method>["requestBody"] extends
		| never
		| undefined
		? EndpointRequest<Path, Method>["parameters"]
		: never,
	Code extends keyof EndpointResponses<Path, Method>,
	P extends Schema.Schema.AnyNoContext,
>(
	path: Path,
	method: Method,
	parameters: Record<string, never> | undefined extends Parameters
		? NoParameters
		: Schema.Schema.Encoded<P> extends Parameters
			? P
			: never,
	handler: (
		parameters_: typeof parameters extends NoParameters
			? never
			: Schema.Schema.Type<P>,
	) => Promise<
		Code extends number ? EndpointResponse<Path, Method, Code> : never
	>,
): DecoratedHandler<typeof handler> => {
	const router = new Hono();

	const substitutedPath = path.replaceAll(pathParameter, ":$<parameter>");

	router.get(substitutedPath, async (c) => {
		const receivedParameters = {
			query: collapseQueries(c.req.queries()),
			path: c.req.param(),
			header: Object.fromEntries(
				Object.entries(c.req.header()).map(
					([key, value]) => [key.toLowerCase(), value] as const,
				),
			),
		};

		let decodedParameters;
		if (parameters === NoParameters) {
			decodedParameters = {};
		} else {
			const decoded = Schema.decodeUnknownEither(
				parameters as Schema.Schema.AnyNoContext,
			)(receivedParameters);
			if (isLeft(decoded)) {
				return c.text(decoded.left.message, 400);
			}

			decodedParameters = decoded.right;
		}

		const response = await requestStorage.run(
			// use store created by middleware and create new store for SSR
			requestStorage.getStore() ?? new RequestStorage(),
			async () => {
				// biome-ignore lint/suspicious/noExplicitAny: types are checked above
				return await handler(decodedParameters as any);
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
			if (response.body !== null && Symbol.asyncIterator in response.body) {
				return stream(c, async (stream) => {
					c.header("Content-Type", "application/json");
					const readable = Readable.from(
						response.body as AsyncIterable<unknown>,
					);
					const adapted = Readable.toWeb(readable.pipe(new ArrayTransform()));

					await stream.pipe(adapted);
				});
			} else {
				return c.json(response.body);
			}
		} else {
			return c.text(`${response.body}`);
		}
	});

	return { router, for: { path, method, handler: handler } };
};
/* node:coverage enable */

// TODO: test
/* node:coverage disable */
export const effectfulEndpoint = <
	Path extends keyof paths,
	Method extends keyof {
		[Method in keyof Pick<
			paths[Path],
			EffectfulHttpMethod
		> as paths[Path][Method] extends undefined ? never : Method]: never;
	} &
		string,
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	RequestBody extends EndpointRequest<Path, Method>["requestBody"],
	ContentType extends "kind" extends keyof RequestBody
		? RequestBody["kind"]
		: never,
	ConcreteRequestBody extends Extract<
		RequestBody,
		{ kind: ContentType }
	>["body"],
	Code extends keyof EndpointResponses<Path, Method>,
	Contextualize extends EffectfulEndpointContext,
	Context extends {
		raw: {
			requestBody: Contextualize["raw"]["requestBody"] extends true
				? ArrayBuffer
				: undefined;
		};
	},
	P extends Schema.Schema.AnyNoContext,
	RB extends Schema.Schema.AnyNoContext,
>(
	path: Path,
	method: Method,
	parameters: Record<string, never> | undefined extends Parameters
		? NoParameters
		: Schema.Schema.Encoded<P> extends Parameters
			? P
			: never,
	contentType: ContentType extends RequestBodyContentType ? ContentType : never,
	requestBody: Record<string, undefined> extends ConcreteRequestBody
		? NoRequestBody
		: Schema.Schema.Encoded<RB> extends ConcreteRequestBody
			? RB
			: never,
	handler: (
		parameters_: typeof parameters extends NoParameters
			? never
			: Schema.Schema.Type<P>,
		requestBody_: typeof requestBody extends NoRequestBody
			? never
			: Schema.Schema.Type<RB>,
		context: Context,
	) => Promise<
		Code extends number ? EndpointResponse<Path, Method, Code> : never
	>,
	contextualize?: Contextualize,
): DecoratedHandler<typeof handler> => {
	const router = new Hono();

	const substitutedPath = path.replaceAll(pathParameter, ":$<parameter>");

	const route = router[method as EffectfulHttpMethod].bind(router);

	route(substitutedPath, async (c) => {
		const receivedParameters = {
			query: collapseQueries(c.req.queries()),
			path: c.req.param(),
			header: Object.fromEntries(
				Object.entries(c.req.header()).map(
					([key, value]) => [key.toLowerCase(), value] as const,
				),
			),
		};

		const receivedRequestBodyContentType = c.req.header("Content-Type");
		if (typeof receivedRequestBodyContentType === "undefined") {
			return c.text("missing content type", 400);
		}

		// TODO: when multiple handlers are defined on the same route for different
		// content types, only the first one will fire
		if (receivedRequestBodyContentType !== contentType) {
			return c.text("unexpected content type", 400);
		}

		const context = {
			raw: {
				requestBody: contextualize?.raw.requestBody
					? await c.req.arrayBuffer()
					: undefined,
			},
		} as Context;

		let receivedRequestBody;
		try {
			switch (contentType) {
				case "text/plain":
					receivedRequestBody = await c.req.text();
					break;
				case "application/json":
					receivedRequestBody = await c.req.json();
					break;
				case "application/x-www-form-urlencoded":
					// due to hono's poor `bodyCache` implementation it's internals trip up
					// when attempting to parse something that is already cached
					if (contextualize?.raw.requestBody) {
						receivedRequestBody = parse(
							// biome-ignore lint/style/noNonNullAssertion: present when respective contextualize flag is set
							Buffer.from(context.raw.requestBody!).toString(),
						);
					} else {
						receivedRequestBody = await c.req.parseBody();
					}
					break;
			}
		} catch (e) {
			console.error(e);
			return c.text("malformed request body", 400);
		}

		let decodedParameters;
		if (parameters === NoParameters) {
			decodedParameters = {};
		} else {
			const decoded = Schema.decodeUnknownEither(
				parameters as Schema.Schema.AnyNoContext,
			)(receivedParameters);
			if (isLeft(decoded)) {
				return c.text(decoded.left.message, 400);
			}

			decodedParameters = decoded.right;
		}

		let decodedRequestBody;
		if (requestBody === NoRequestBody) {
			decodedRequestBody = {};
		} else {
			const decoded = Schema.decodeUnknownEither(
				requestBody as Schema.Schema.AnyNoContext,
			)(receivedRequestBody);
			if (isLeft(decoded)) {
				return c.text(decoded.left.message, 400);
			}

			decodedRequestBody = decoded.right;
		}

		const response = await requestStorage.run(
			// use store created by middleware and create new store for SSR
			requestStorage.getStore() ?? new RequestStorage(),
			async () => {
				return await handler(
					// biome-ignore lint/suspicious/noExplicitAny: types are checked above
					decodedParameters as any,
					// biome-ignore lint/suspicious/noExplicitAny: types are checked above
					decodedRequestBody as any,
					context,
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
			if (response.body !== null && Symbol.asyncIterator in response.body) {
				return stream(c, async (stream) => {
					c.header("Content-Type", "application/json");

					const readable = Readable.from(
						response.body as AsyncIterable<unknown>,
					);
					const adapted = Readable.toWeb(readable.pipe(new ArrayTransform()));

					await stream.pipe(adapted);
				});
			} else {
				return c.json(response.body);
			}
		} else {
			return c.text(`${response.body}`);
		}
	});

	return { router, for: { path, method, handler: handler } };
};
/* node:coverage enable */

// TODO: test
/* node:coverage disable */
export const effectfulSinkEndpoint = <
	Path extends keyof paths,
	Method extends keyof {
		[Method in keyof Pick<
			paths[Path],
			EffectfulHttpMethod
		> as paths[Path][Method] extends undefined ? never : Method]: never;
	} &
		string,
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	RequestBody extends EndpointRequest<Path, Method>["requestBody"],
	ContentType extends "kind" extends keyof RequestBody
		? RequestBody["kind"]
		: never,
	Code extends keyof EndpointResponses<Path, Method>,
	P extends Schema.Schema.AnyNoContext,
>(
	path: Path,
	method: Method,
	parameters: Record<string, never> | undefined extends Parameters
		? NoParameters
		: Schema.Schema.Encoded<P> extends Parameters
			? P
			: never,
	contentType: ContentType extends RequestBodyContentType ? ContentType : never,
	handler: (
		parameters_: typeof parameters extends NoParameters
			? never
			: Schema.Schema.Type<P>,
		// biome-ignore lint/suspicious/noExplicitAny: handler has to perform validation
		requestBody_: ReadableStream<any>,
	) => Promise<
		Code extends number ? EndpointResponse<Path, Method, Code> : never
	>,
): DecoratedHandler<typeof handler> => {
	const router = new Hono();

	const substitutedPath = path.replaceAll(pathParameter, ":$<parameter>");

	const route = router[method as EffectfulHttpMethod].bind(router);

	route(substitutedPath, async (c) => {
		const receivedParameters = {
			query: collapseQueries(c.req.queries()),
			path: c.req.param(),
			header: Object.fromEntries(
				Object.entries(c.req.header()).map(
					([key, value]) => [key.toLowerCase(), value] as const,
				),
			),
		};

		const receivedRequestBodyContentType = c.req.header("Content-Type");
		if (typeof receivedRequestBodyContentType === "undefined") {
			return c.text("missing content type", 400);
		}

		// TODO: when multiple handlers are defined on the same route for different
		// content types, only the first one will fire
		if (receivedRequestBodyContentType !== contentType) {
			return c.text("unexpected content type", 400);
		}

		const requestBody = c.req.raw.body;
		if (isNone(requestBody)) {
			return c.text("unexpected empty request body", 400);
		}

		let decodedParameters;
		if (parameters === NoParameters) {
			decodedParameters = {};
		} else {
			const decoded = Schema.decodeUnknownEither(
				parameters as Schema.Schema.AnyNoContext,
			)(receivedParameters);
			if (isLeft(decoded)) {
				return c.text(decoded.left.message, 400);
			}

			decodedParameters = decoded.right;
		}

		const response = await requestStorage.run(
			// use store created by middleware and create new store for SSR
			requestStorage.getStore() ?? new RequestStorage(),
			async () => {
				return await handler(
					// biome-ignore lint/suspicious/noExplicitAny: types are checked above
					decodedParameters as any,
					requestBody,
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
			if (response.body !== null && Symbol.asyncIterator in response.body) {
				return stream(c, async (stream) => {
					c.header("Content-Type", "application/json");

					const readable = Readable.from(
						response.body as AsyncIterable<unknown>,
					);
					const adapted = Readable.toWeb(readable.pipe(new ArrayTransform()));

					await stream.pipe(adapted);
				});
			} else {
				return c.json(response.body);
			}
		} else {
			return c.text(`${response.body}`);
		}
	});

	return { router };
};
/* node:coverage enable */
