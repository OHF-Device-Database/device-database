import type { IncomingMessage } from "node:http";
import { type Readable, Transform, type TransformCallback } from "node:stream";

import {
	createParamDecorator,
	type ExecutionContext,
	type INestApplicationContext,
	InternalServerErrorException,
} from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";

import { RouteSchemaMetadata } from "./route";

import type { RouteSchema } from "./schema";

/** the largest request body a route accepts, in bytes */
export const REQUEST_BODY_LIMIT = 5120 * 1024;

/**
 * the route consumes the request body itself
 *
 * the platform's parser is kept away from it, and `limit` is enforced while the
 * body is read rather than before the handler is entered
 */
export const StreamedBody = Reflector.createDecorator<
	number | undefined,
	number
>({
	key: "route:streamed-body",
	transform: (limit) => limit ?? REQUEST_BODY_LIMIT,
});

/** where the body interceptor leaves the stream it prepared */
export const ROUTE_BODY_STREAM = Symbol("route:body-stream");

/** a platform request the body interceptor has prepared a stream on */
export type StreamedRequest = Readable & {
	[ROUTE_BODY_STREAM]?: Readable;
};

export class RequestBodyTooLargeError extends Error {
	constructor(public limit: number) {
		super(`request body exceeds <${limit}> bytes`);
		Object.setPrototypeOf(this, RequestBodyTooLargeError.prototype);
	}
}

/** passes a request body through, throwing {@link RequestBodyTooLargeError} as soon as `limit` is passed */
export class TransformRequestBodyLimit extends Transform {
	private received = 0;

	constructor(private readonly limit: number = REQUEST_BODY_LIMIT) {
		super({ objectMode: false });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.received += chunk.length;
		if (this.received > this.limit) {
			callback(new RequestBodyTooLargeError(this.limit));
			return;
		}

		this.push(chunk);
		callback();
	}
}

/** picks up the capped body stream from where the body interceptor left it */
export const RequestBodyStream = createParamDecorator(
	(_: unknown, ctx: ExecutionContext): Readable => {
		const body = ctx.switchToHttp().getRequest<StreamedRequest>()[
			ROUTE_BODY_STREAM
		];
		if (typeof body === "undefined") {
			throw new InternalServerErrorException(
				"route did not declare a streamed body",
			);
		}

		return body;
	},
);

/** schema paths of every route that declared {@link StreamedBody} */
export const streamedRoutes = (
	app: INestApplicationContext,
): ReadonlySet<string> => {
	const discovery = app.get(DiscoveryService);
	const scanner = app.get(MetadataScanner);
	const reflector = app.get(Reflector);

	const paths: Set<string> = new Set();

	for (const wrapper of discovery.getControllers()) {
		const prototype: unknown = wrapper.metatype?.prototype;
		if (typeof prototype !== "object" || prototype === null) {
			continue;
		}

		for (const name of scanner.getAllMethodNames(prototype)) {
			const handler = (prototype as Record<string, unknown>)[name];
			if (typeof handler !== "function") {
				continue;
			}

			const limit: number | undefined = reflector.get(StreamedBody, handler);
			if (typeof limit === "undefined") {
				continue;
			}

			// always co-present, as only `@Route` handlers are reachable over http
			const route: RouteSchema | undefined = reflector.get(
				RouteSchemaMetadata,
				handler,
			);
			if (typeof route !== "undefined") {
				paths.add(route.path);
			}
		}
	}

	return paths;
};

const PATH_PARAMETER = /\{[^}]+\}/gu;
const PATTERN_RESERVED = /[.*+?^${}()|[\]\\]/gu;

/** `/a/{id}` → `/^\/a\/[^\/]+$/` */
const toPattern = (path: string): RegExp =>
	new RegExp(
		`^${path
			.split(PATH_PARAMETER)
			.map((literal) => literal.replace(PATTERN_RESERVED, "\\$&"))
			.join("[^/]+")}$`,
		"u",
	);

/** whether a request is bound for one of `paths` */
export const streamedRouteMatcher = (
	paths: ReadonlySet<string>,
): ((request: IncomingMessage) => boolean) => {
	const patterns = [...paths].map(toPattern);

	return (request) => {
		if (typeof request.url === "undefined") {
			return false;
		}

		const path = request.url.split("?").at(0);
		if (typeof path === "undefined") {
			return false;
		}

		return patterns.some((pattern) => pattern.test(path));
	};
};
