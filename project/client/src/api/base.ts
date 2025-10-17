import { Schema } from "effect";
import { isLeft, isRight } from "effect/Either";

import type { operations, paths } from "../schema";
import type { ParseError } from "effect/ParseResult";

type IdempotentHttpMethod = "get" | "head";
type EffectfulHttpMethod = "put" | "patch" | "post" | "delete";

type IdempotentOperation = {
	[Operation in keyof operations as keyof EnclosingPath<Operation>[keyof EnclosingPath<Operation>] extends IdempotentHttpMethod
		? Operation
		: never]: operations[Operation];
};

type EffectfulOperation = {
	[Operation in keyof operations as keyof EnclosingPath<Operation>[keyof EnclosingPath<Operation>] extends EffectfulHttpMethod
		? Operation
		: never]: operations[Operation];
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- closest match
type WithoutEmpty<T> = { [K in keyof T as {} extends T[K] ? never : K]: T[K] };

// path in which operation is nested
type EnclosingPath<O extends keyof operations> = WithoutEmpty<{
	[Path in keyof paths]: {
		[Operation in keyof paths[Path] as paths[Path][Operation] extends operations[O]
			? Operation
			: never]: paths[Path][Operation] extends operations[O]
			? operations[O]
			: never;
	};
}>;

type EndpointRequestParameters<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "parameters" extends keyof paths[Path][Method]
	? paths[Path][Method]["parameters"] extends Record<string, never>
		? { parameters?: paths[Path][Method]["parameters"] }
		: // only support parameter types that extend string
			// additionally enforced by schema linter enforces
			{
				parameters: {
					[Type in keyof paths[Path][Method]["parameters"]]: {
						[Parameter in keyof paths[Path][Method]["parameters"][Type]]: paths[Path][Method]["parameters"][Type][Parameter] extends string
							? paths[Path][Method]["parameters"][Type][Parameter]
							: never;
					};
				};
			}
	: never;
type EndpointRequestRequestBody<
	Path extends keyof paths,
	Method extends keyof paths[Path],
> = "requestBody" extends keyof paths[Path][Method]
	? // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- false positive
		paths[Path][Method]["requestBody"] extends never | undefined
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

type RequestBody<C, B> = {
	contentType: C;
	body: B;
};

type RequestContentType = "text/plain" | "application/json";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- phantom type
export type BuiltOperation<Responses> = {
	name: string;
	path: string;
	method: string;
	parameters: {
		query: Record<string, string>;
		path: Record<string, string>;
		header: Record<string, string>;
	};
	body?: RequestBody<RequestContentType, unknown>;
};

export function idempotentOperation<
	Operation extends keyof IdempotentOperation,
	EnclosedWithin extends EnclosingPath<Operation>,
	Path extends keyof EnclosedWithin & keyof paths,
	Method extends keyof EnclosedWithin[Path] & keyof paths[Path],
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- false positive
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	Responses extends EndpointResponses<Path, Method>,
>(
	operation: Operation,
	path: Path,
	method: Method & string,
	parameters: Parameters
): BuiltOperation<Responses> {
	return {
		name: operation,
		path,
		method,
		parameters: {
			query: {},
			path: {},
			header: {},
			...parameters,
		},
	};
}

export function effectfulOperation<
	Operation extends keyof EffectfulOperation,
	EnclosedWithin extends EnclosingPath<Operation>,
	Path extends keyof EnclosedWithin & keyof paths,
	// effectful operations _without_ request body
	Method extends keyof {
		[M in keyof EnclosedWithin[Path] as "requestBody" extends keyof EnclosedWithin[Path][M]
			? never
			: M]: never;
	} &
		keyof paths[Path],
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- false positive
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	Responses extends EndpointResponses<Path, Method>,
>(
	operation: Operation,
	path: Path,
	method: Method,
	parameters: Parameters
): BuiltOperation<Responses>;
export function effectfulOperation<
	Operation extends keyof EffectfulOperation,
	EnclosedWithin extends EnclosingPath<Operation>,
	Path extends keyof EnclosedWithin & keyof paths,
	// effectful operations _with_ request body
	Method extends keyof {
		[_Method in keyof EnclosedWithin[Path] as "requestBody" extends keyof EnclosedWithin[Path][_Method]
			? _Method
			: never]: never;
	} &
		keyof paths[Path],
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- false positive
	Parameters extends EndpointRequest<Path, Method>["parameters"],
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- false positive
	RequestBody extends EndpointRequest<Path, Method>["requestBody"],
	Responses extends EnclosedWithin[Path][Method]["responses"],
>(
	operation: Operation,
	path: Path,
	method: Method,
	parameters: Parameters,
	body: RequestBody
): BuiltOperation<Responses>;
/* eslint-disable @typescript-eslint/no-explicit-any -- typing enforced in overloads */
export function effectfulOperation(
	operation: any,
	path: any,
	method: any,
	parameters: any,
	body?: any
) {
	return {
		/* eslint-disable @typescript-eslint/no-unsafe-assignment -- intentional */
		name: operation,
		path: path,
		method,
		parameters: {
			query: {},
			path: {},
			header: {},
			...parameters,
		},
		body,
	};
	/* eslint-enable @typescript-eslint/no-unsafe-assignment */
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any -- defines shape, `any` is intentional */
export type ResponsesShape = Record<
	number,
	| {
			content: Record<string, any>;
	  }
	| {
			content: Record<string, any>;
			headers: Record<string, string>;
	  }
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// https://fetch.spec.whatwg.org/#forbidden-response-header-name
type PrunedHeaders<T> = Omit<T, "set-cookie" | "Set-Cookie">;

// lowers status code into value to distribute
export type DistributeResponses<T extends ResponsesShape> = {
	[Code in keyof T]: Record<string, unknown> extends PrunedHeaders<
		Code extends keyof T
			? "headers" extends keyof T[Code]
				? T[Code]["headers"]
				: never
			: never
	>
		? {
				code: Code;
				body: "content" extends keyof T[Code]
					? T[Code]["content"][keyof T[Code]["content"]]
					: never;
			}
		: {
				code: Code;
				body: "content" extends keyof T[Code]
					? T[Code]["content"][keyof T[Code]["content"]]
					: never;
				headers: PrunedHeaders<
					Code extends keyof T
						? "headers" extends keyof T[Code]
							? T[Code]["headers"]
							: never
						: never
				>;
			};
}[keyof T];

export type Io = <Responses extends ResponsesShape>(
	built: BuiltOperation<Responses>,
	signal?: AbortSignal
) => Promise<DistributeResponses<Responses>>;

export class ResponseError extends Error {
	constructor(public message: string) {
		super(message);
		Object.setPrototypeOf(this, Error.prototype);
	}
}

export class UnexpectedResponseError extends ResponseError {
	constructor(public error: ParseError) {
		super(`decoding error occurred: ${error.message}`);
		Object.setPrototypeOf(this, UnexpectedResponseError.prototype);
	}
}

export class NotFoundError extends ResponseError {
	constructor() {
		super("not found");
		Object.setPrototypeOf(this, NotFoundError.prototype);
	}
}

export class DescribedError extends ResponseError {
	constructor(public message: string) {
		super(message);
		Object.setPrototypeOf(this, DescribedError.prototype);
	}
}

const ErrorNotFound = Schema.Struct({
	code: Schema.Literal(404),
});
const errorNotFoundDecoder = Schema.decodeUnknownEither(ErrorNotFound);

const ErrorDescribed = Schema.Struct({
	body: Schema.Struct({
		message: Schema.String,
	}),
});
const errorDescribedDecoder = Schema.decodeUnknownEither(ErrorDescribed);

const fetch = async <R extends ResponsesShape, M extends typeof Schema.Any>(
	built: BuiltOperation<R>,
	responses: M,
	io: Io
): Promise<M["Type"]> => {
	const response = await io(built);

	const decoder = Schema.decodeUnknownEither(responses);
	const decoded = decoder(response);
	if (isLeft(decoded)) {
		{
			const decoded = errorNotFoundDecoder(response);
			if (isRight(decoded)) {
				throw new NotFoundError();
			}
		}

		{
			const decoded = errorDescribedDecoder(response);
			if (isRight(decoded)) {
				throw new DescribedError(decoded.right.body.message);
			}
		}

		throw new UnexpectedResponseError(decoded.left);
	}

	return response;
};

type Response<R extends ResponsesShape, C extends number> = Extract<
	DistributeResponses<R>,
	{ code: C }
>;

export const bindFetch =
	(io: Io) =>
	async <R extends ResponsesShape, M extends typeof Schema.Any>(
		built: BuiltOperation<R>,
		responses: M["Encoded"] extends Response<
			R,
			Extract<M["Encoded"]["code"], DistributeResponses<R>["code"]>
		>
			? Response<
					R,
					Extract<M["Encoded"]["code"], DistributeResponses<R>["code"]>
				> extends M["Encoded"]
				? M
				: never
			: never
	) =>
		fetch(built, responses, io);

export type Fetch = ReturnType<typeof bindFetch>;
