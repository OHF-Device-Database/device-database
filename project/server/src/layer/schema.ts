import type { Schema } from "effect";

import type { paths } from "../schema";

export type HttpMethod = "get" | "put" | "post" | "patch" | "delete";

/** http methods a path actually declares in schema */
export type _MethodOf<Paths, Path extends keyof Paths> = Exclude<
	{
		[Method in Extract<
			keyof Paths[Path],
			HttpMethod
		>]: Paths[Path][Method] extends undefined | never ? never : Method;
	}[Extract<keyof Paths[Path], HttpMethod>],
	undefined
>;

export type _MethodKeyOf<Paths, Path extends keyof Paths> = _MethodOf<
	Paths,
	Path
> &
	keyof Paths[Path];

type _OperationOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = Paths[Path][Method];

type _ResponsesOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = "responses" extends keyof _OperationOf<Paths, Path, Method>
	? _OperationOf<Paths, Path, Method>["responses"]
	: never;

/** status codes declared for the operation */
export type _StatusOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = keyof _ResponsesOf<Paths, Path, Method>;

// https://github.com/openapi-ts/openapi-typescript/issues/2457
type LaxOptionalProperty<T> =
	T extends Record<string, unknown>
		? {
				[K in keyof T]: Omit<T, K> extends T
					? LaxOptionalProperty<T[K]> | undefined
					: LaxOptionalProperty<T[K]>;
			}
		: T extends ReadonlyArray<infer I>
			? readonly LaxOptionalProperty<I>[]
			: T;

type Body<T> =
	T extends ReadonlyArray<infer R>
		? readonly LaxOptionalProperty<R>[]
		: LaxOptionalProperty<T>;

// only require `headers` to be supplied when the response declares at least one concrete header
// (bare `[name: string]: unknown` index signature does not count)
type HeadersProperty<T> =
	{
		[H in keyof T as unknown extends T[H] ? never : H]: T[H];
	} extends Record<string, never>
		? { readonly headers?: undefined }
		: { readonly headers: T };

type _ContentMapOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
	Code extends keyof _ResponsesOf<Paths, Path, Method>,
> = "content" extends keyof _ResponsesOf<Paths, Path, Method>[Code]
	? _ResponsesOf<Paths, Path, Method>[Code]["content"]
	: never;

type _HeadersOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
	Code extends keyof _ResponsesOf<Paths, Path, Method>,
> = "headers" extends keyof _ResponsesOf<Paths, Path, Method>[Code]
	? HeadersProperty<_ResponsesOf<Paths, Path, Method>[Code]["headers"]>
	: { readonly headers?: undefined };

// one member per content type the status code declares, so `body` is tied to the `contentType` actually chosen rather than to the union of all of them
type _ResponseOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
	Code extends keyof _ResponsesOf<Paths, Path, Method>,
> = [_ContentMapOf<Paths, Path, Method, Code>] extends [never]
	? {
			readonly code: Code;
			readonly contentType?: undefined;
			readonly body?: undefined;
		}
	: {
			[ContentType in keyof _ContentMapOf<Paths, Path, Method, Code>]: {
				readonly code: Code;
				readonly contentType: ContentType;
				readonly body: Body<
					_ContentMapOf<Paths, Path, Method, Code>[ContentType]
				>;
			};
		}[keyof _ContentMapOf<Paths, Path, Method, Code>];

/** discriminated union over the status codes the operation declares, optionally narrowed to `Code` */
export type _EndpointResponse<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
	Code extends keyof _ResponsesOf<Paths, Path, Method> = keyof _ResponsesOf<
		Paths,
		Path,
		Method
	>,
> = {
	[C in Code]: _ResponseOf<Paths, Path, Method, C> &
		_HeadersOf<Paths, Path, Method, C>;
}[Code];

/** names of the path parameters declared for the operation */
export type _PathParamOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = "parameters" extends keyof _OperationOf<Paths, Path, Method>
	? "path" extends keyof _OperationOf<Paths, Path, Method>["parameters"]
		? keyof _OperationOf<Paths, Path, Method>["parameters"]["path"]
		: never
	: never;

/** names of the query parameters declared for the operation */
export type _QueryParamOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = "parameters" extends keyof _OperationOf<Paths, Path, Method>
	? "query" extends keyof _OperationOf<Paths, Path, Method>["parameters"]
		? [_OperationOf<Paths, Path, Method>["parameters"]["query"]] extends [
				undefined,
			]
			? never
			: keyof NonNullable<
					_OperationOf<Paths, Path, Method>["parameters"]["query"]
				>
		: never
	: never;

/** parameter sections declared for the operation */
export type _ParametersOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = "parameters" extends keyof _OperationOf<Paths, Path, Method>
	? _OperationOf<Paths, Path, Method>["parameters"]
	: never;

// a query parameter that may repeat is indistinguishable from a single occurrence at runtime, so both the unary and the array form are accepted
type QueryInput<T> = {
	[Name in keyof T]: NonNullable<T[Name]> extends ReadonlyArray<infer Value>
		? Value | readonly Value[]
		: T[Name];
};

/** encoded (input) shape a parameters validation schema has to accept */
export type _ParametersInputOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = [_ParametersOf<Paths, Path, Method>] extends [never]
	? never
	: LaxOptionalProperty<{
			[Section in keyof _ParametersOf<
				Paths,
				Path,
				Method
			>]: Section extends "query"
				? QueryInput<NonNullable<_ParametersOf<Paths, Path, Method>[Section]>>
				: _ParametersOf<Paths, Path, Method>[Section];
		}>;

/** request body of the operation */
export type _RequestBodyOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = "requestBody" extends keyof _OperationOf<Paths, Path, Method>
	? "content" extends keyof _OperationOf<Paths, Path, Method>["requestBody"]
		? Body<
				_OperationOf<
					Paths,
					Path,
					Method
				>["requestBody"]["content"][keyof _OperationOf<
					Paths,
					Path,
					Method
				>["requestBody"]["content"]]
			>
		: never
	: never;

/** shape a controller class can implement to adhere with schema-defined routes */
export type _Implements<Paths, Path extends keyof Paths> = {
	[Method in _MethodKeyOf<Paths, Path>]: (
		...args: never[]
	) =>
		| _EndpointResponse<Paths, Path, Method>
		| Promise<_EndpointResponse<Paths, Path, Method>>;
};

/** content type to respond with, per declared status code */
export type _ContentTypeOf<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
> = {
	readonly [Code in keyof _ResponsesOf<
		Paths,
		Path,
		Method
	> as "content" extends keyof _ResponsesOf<Paths, Path, Method>[Code]
		? Code
		: never]: "content" extends keyof _ResponsesOf<Paths, Path, Method>[Code]
		? keyof _ResponsesOf<Paths, Path, Method>[Code]["content"] & string
		: never;
};

/** effect schemas the request is validated against before the handler runs */
export type _Codec<
	Paths,
	Path extends keyof Paths,
	Method extends keyof Paths[Path],
	CodecParameters extends Schema.Schema.AnyNoContext,
	CodecRequestBody extends Schema.Schema.AnyNoContext,
> = {
	/** codec for `{ path, query, header }` */
	readonly parameters?: Schema.Schema.Encoded<CodecParameters> extends _ParametersInputOf<
		Paths,
		Path,
		Method
	>
		? CodecParameters
		: never;
	/** codec for request body */
	readonly requestBody?: Schema.Schema.Encoded<CodecRequestBody> extends _RequestBodyOf<
		Paths,
		Path,
		Method
	>
		? CodecRequestBody
		: never;
};

// what the handler is handed for a section, `undefined` when not provided
type Decoded<Codec> = [Codec] extends [never]
	? undefined
	: Schema.Schema.Type<Codec>;

export type HandlerArguments<ParametersSchema, RequestBodySchema> = [
	RequestBodySchema,
] extends [never]
	? [ParametersSchema] extends [never]
		? [...bound: never[]]
		: [parameters: Decoded<ParametersSchema>, ...bound: never[]]
	: [
			parameters: Decoded<ParametersSchema>,
			requestBody: Decoded<RequestBodySchema>,
			...bound: never[],
		];

/** http methods a path actually declares in schema */
export type MethodOf<Path extends keyof paths> = _MethodOf<paths, Path>;
export type MethodKeyOf<Path extends keyof paths> = _MethodKeyOf<paths, Path>;
/** status codes declared for the operation */
export type StatusOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _StatusOf<paths, Path, Method>;
/**
 * discriminated union over the status codes the operation declares, optionally
 * narrowed to `Code`
 */
export type EndpointResponse<
	Path extends keyof paths,
	Method extends keyof paths[Path],
	Code extends StatusOf<Path, Method> = StatusOf<Path, Method>,
> = _EndpointResponse<paths, Path, Method, Code>;
/** names of the path parameters declared for the operation */
export type PathParamOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _PathParamOf<paths, Path, Method>;
/** names of the query parameters declared for the operation */
export type QueryParamOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _QueryParamOf<paths, Path, Method>;
/** parameter sections declared for the operation */
export type ParametersOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _ParametersOf<paths, Path, Method>;
/** encoded (input) shape a parameters validation schema has to accept */
export type ParametersInputOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _ParametersInputOf<paths, Path, Method>;
/** request body of the operation */
export type RequestBodyOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _RequestBodyOf<paths, Path, Method>;
/** shape a controller class can implement to adhere with schema-defined routes */
export type Implements<Path extends keyof paths> = _Implements<paths, Path>;
/** content type to respond with, per declared status code */
export type ContentTypeOf<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = _ContentTypeOf<paths, Path, Method>;

/** schema descriptor recorded by `@Route` */
export type RouteSchema = {
	readonly path: string;
	readonly method: string;
};

/** codecs recorded by `@Route` */
export type RouteCodec = {
	readonly parameters?: Schema.Schema.AnyNoContext | undefined;
	readonly requestBody?: Schema.Schema.AnyNoContext | undefined;
};
