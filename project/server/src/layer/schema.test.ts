import type { Schema } from "effect";

import type {
	_Codec,
	_ContentTypeOf,
	_EndpointResponse,
	_Implements,
	_MethodOf,
	_ParametersInputOf,
	_ParametersOf,
	_PathParamOf,
	_QueryParamOf,
	_RequestBodyOf,
	_StatusOf,
} from "./schema";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

// mirrors the shape openapi-typescript emits, including `?: never` for the
// verbs a path does not declare
export type MockPaths = {
	readonly "/thing": {
		readonly parameters: {
			readonly query?: never;
			readonly header?: never;
			readonly path?: never;
			readonly cookie?: never;
		};
		readonly get: {
			readonly parameters: {
				readonly query?: { readonly page?: string; readonly size?: string };
				readonly header?: never;
				readonly path?: never;
				readonly cookie?: never;
			};
			readonly requestBody?: never;
			readonly responses: {
				readonly 200: {
					headers: {
						readonly "x-total": string;
						readonly [name: string]: unknown;
					};
					content: { readonly "application/json": { readonly id: string } };
				};
				readonly 404: {
					headers: { readonly [name: string]: unknown };
					content: { readonly "text/plain": "missing" };
				};
			};
		};
		readonly put?: never;
		readonly post: {
			readonly parameters: {
				readonly query?: never;
				readonly header?: never;
				readonly path?: never;
				readonly cookie?: never;
			};
			readonly requestBody: {
				readonly content: {
					readonly "application/json": { readonly name: string };
				};
			};
			readonly responses: {
				readonly 201: {
					headers: { readonly [name: string]: unknown };
					content: { readonly "application/json": { readonly id: string } };
				};
			};
		};
		readonly delete?: never;
		readonly options?: never;
		readonly head?: never;
		readonly patch?: never;
		readonly trace?: never;
	};
	readonly "/thing/{id}": {
		readonly parameters: {
			readonly query?: never;
			readonly header?: never;
			readonly path?: never;
			readonly cookie?: never;
		};
		readonly get: {
			readonly parameters: {
				readonly query?: never;
				readonly header?: never;
				readonly path: { readonly id: string };
				readonly cookie?: never;
			};
			readonly requestBody?: never;
			readonly responses: {
				readonly 204: {
					headers: { readonly [name: string]: unknown };
				};
			};
		};
		readonly put?: never;
		readonly post?: never;
		readonly delete?: never;
		readonly options?: never;
		readonly head?: never;
		readonly patch?: never;
		readonly trace?: never;
	};
	readonly "/search": {
		readonly parameters: {
			readonly query?: never;
			readonly header?: never;
			readonly path?: never;
			readonly cookie?: never;
		};
		readonly get: {
			readonly parameters: {
				readonly query: {
					readonly q: string;
					readonly tag?: readonly string[];
				};
				readonly header?: never;
				readonly path?: never;
				readonly cookie: { readonly session: string };
			};
			readonly requestBody?: never;
			readonly responses: {
				readonly 204: {
					headers: { readonly [name: string]: unknown };
				};
			};
		};
		readonly put?: never;
		readonly post?: never;
		readonly delete?: never;
		readonly options?: never;
		readonly head?: never;
		readonly patch?: never;
		readonly trace?: never;
	};
};

// only declared verbs survive; the `?: never` ones are filtered out
export type AssertMethod = Expect<
	Equal<_MethodOf<MockPaths, "/thing">, "get" | "post">
>;
export type AssertMethodSingle = Expect<
	Equal<_MethodOf<MockPaths, "/thing/{id}">, "get">
>;

export type AssertStatus = Expect<
	Equal<_StatusOf<MockPaths, "/thing", "get">, 200 | 404>
>;

export type AssertQuery = Expect<
	Equal<_QueryParamOf<MockPaths, "/thing", "get">, "page" | "size">
>;
export type AssertNoQuery = Expect<
	Equal<_QueryParamOf<MockPaths, "/thing", "post">, never>
>;

export type AssertPathParam = Expect<
	Equal<_PathParamOf<MockPaths, "/thing/{id}", "get">, "id">
>;
export type AssertNoPathParam = Expect<
	Equal<_PathParamOf<MockPaths, "/thing", "get">, never>
>;

export type AssertRequestBody = Expect<
	Equal<_RequestBodyOf<MockPaths, "/thing", "post">, { readonly name: string }>
>;
export type AssertNoRequestBody = Expect<
	Equal<_RequestBodyOf<MockPaths, "/thing", "get">, never>
>;

export type AssertParameters = Expect<
	Equal<
		_ParametersOf<MockPaths, "/thing", "get">,
		{
			readonly query?: { readonly page?: string; readonly size?: string };
			readonly header?: never;
			readonly path?: never;
			readonly cookie?: never;
		}
	>
>;

// a section the operation does not declare collapses to `undefined`, so a
// validation schema may not declare it either; optional properties are widened
// with `undefined`, because that is what `Schema.optional` encodes to
export type AssertParametersInput = Expect<
	Equal<
		_ParametersInputOf<MockPaths, "/thing", "get">,
		{
			readonly query?:
				| {
						readonly page?: string | undefined;
						readonly size?: string | undefined;
				  }
				| undefined;
			readonly header?: undefined;
			readonly path?: undefined;
			readonly cookie?: undefined;
		}
	>
>;

// a repeatable query parameter may be validated in its unary form as well
export type AssertParametersInputQuery = Expect<
	Equal<
		_ParametersInputOf<MockPaths, "/search", "get">,
		{
			readonly query: {
				readonly q: string;
				readonly tag?: string | readonly string[] | undefined;
			};
			readonly header?: undefined;
			readonly path?: undefined;
			readonly cookie: { readonly session: string };
		}
	>
>;

// a validation schema may narrow what the operation declares ...
export type AssertParametersInputAccepted = Expect<
	{
		readonly query: { readonly q: "a" | "b"; readonly tag: readonly string[] };
		readonly cookie: { readonly session: string };
	} extends _ParametersInputOf<MockPaths, "/search", "get">
		? true
		: false
>;

// ... but not accept something the operation does not declare
export type AssertParametersInputRejected = Expect<
	Equal<
		{
			readonly query: { readonly undeclared: string };
		} extends _ParametersInputOf<MockPaths, "/thing", "get">
			? true
			: false,
		false
	>
>;

// `@Route` infers the validation schemas rather than taking them as type
// arguments, so the check that they encode to what the operation declares is
// the one `_Validation` performs
type ValidatedParameters<S extends Schema.Schema.AnyNoContext> = Exclude<
	_Codec<MockPaths, "/thing", "get", S, never>["parameters"],
	undefined
>;
type ValidatedRequestBody<S extends Schema.Schema.AnyNoContext> = Exclude<
	_Codec<MockPaths, "/thing", "get", never, S>["requestBody"],
	undefined
>;

type PageQuery = Schema.Schema<
	{ readonly page: number },
	{ readonly query: { readonly page?: string | undefined } },
	never
>;
type UndeclaredQuery = Schema.Schema<
	{ readonly undeclared: number },
	{ readonly query: { readonly undeclared: string } },
	never
>;

export type AssertValidationAccepted = Expect<
	Equal<ValidatedParameters<PageQuery>, PageQuery>
>;
// a schema that does not encode to the declared parameters collapses to `never`
export type AssertValidationRejected = Expect<
	Equal<ValidatedParameters<UndeclaredQuery>, never>
>;
// the operation declares no request body, so no schema is accepted for it
export type AssertValidationBodilessRejected = Expect<
	Equal<ValidatedRequestBody<PageQuery>, never>
>;

// one entry per status code that declares a body, valued by that code's content type
export type AssertContentType = Expect<
	Equal<
		_ContentTypeOf<MockPaths, "/thing", "get">,
		{ readonly 200: "application/json"; readonly 404: "text/plain" }
	>
>;
// the 204 declares no content, so no entry is required
export type AssertContentTypeEmpty = Expect<
	Equal<keyof _ContentTypeOf<MockPaths, "/thing/{id}", "get">, never>
>;

type ThingGet = _EndpointResponse<MockPaths, "/thing", "get">;

export const accepted: ThingGet[] = [
	// 200 declares a concrete `x-total` header, so headers are required
	{
		code: 200,
		contentType: "application/json",
		body: { id: "a" },
		headers: { "x-total": "1" },
	},
	// 404 declares only an index signature, so headers may be omitted
	{ code: 404, contentType: "text/plain", body: "missing" },
];

// @ts-expect-error 200 requires the declared `x-total` header
export const missingHeader: ThingGet = {
	code: 200,
	contentType: "application/json",
	body: { id: "a" },
};

// @ts-expect-error the response declares a body, so `contentType` is required
export const missingContentType: ThingGet = { code: 404, body: "missing" };

// @ts-expect-error body must match the content type paired with it
export const wrongBodyForCode: ThingGet = {
	code: 404,
	contentType: "text/plain",
	body: { id: "a" },
};

// @ts-expect-error 404 declares text/plain, not application/json
export const wrongContentTypeForCode: ThingGet = {
	code: 404,
	contentType: "application/json",
	body: "missing",
};

// @ts-expect-error 500 is not declared for this operation
export const undeclaredCode: ThingGet = { code: 500, body: "x" };

type ThingIdGet = _EndpointResponse<MockPaths, "/thing/{id}", "get">;

// a status code declaring no body takes neither `contentType` nor `body`
export const bodiless: ThingIdGet = { code: 204 };

// @ts-expect-error 204 declares no content
export const bodilessWithBody: ThingIdGet = { code: 204, body: "x" };

export class MockController implements _Implements<MockPaths, "/thing"> {
	async get(): Promise<ThingGet> {
		return { code: 404, contentType: "text/plain", body: "missing" };
	}

	async post(): Promise<_EndpointResponse<MockPaths, "/thing", "post">> {
		return { code: 201, contentType: "application/json", body: { id: "a" } };
	}
}

// @ts-expect-error `post` is declared by the mock schema but not implemented
export class PartialController implements _Implements<MockPaths, "/thing"> {
	async get(): Promise<ThingGet> {
		return { code: 404, contentType: "text/plain", body: "missing" };
	}
}
