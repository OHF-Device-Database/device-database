import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { type TestContext, test } from "node:test";

import type { CallHandler, INestApplicationContext } from "@nestjs/common";
import { PayloadTooLargeException } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { firstValueFrom, from, of, throwError } from "rxjs";

import {
	REQUEST_BODY_LIMIT,
	ROUTE_BODY_STREAM,
	StreamedBody,
	type StreamedRequest,
	streamedRouteMatcher,
	streamedRoutes,
} from "./body";
import { InterceptorRouteBody } from "./body.interceptor";
import { _Route } from "./route";
import { executionContext } from "./test";

import type { RequestStreamStub } from "./test";

type Paths = {
	readonly "/upload": {
		readonly post: {
			readonly responses: {
				readonly 204: { headers: { readonly [name: string]: unknown } };
			};
		};
	};
	readonly "/thing/{id}": {
		readonly put: {
			readonly parameters: { readonly path: { readonly id: string } };
			readonly responses: {
				readonly 204: { headers: { readonly [name: string]: unknown } };
			};
		};
	};
	readonly "/parsed": {
		readonly post: {
			readonly responses: {
				readonly 204: { headers: { readonly [name: string]: unknown } };
			};
		};
	};
};

const Route = _Route<Paths>();

class Controller {
	@Route("post", "/upload")
	@StreamedBody()
	async upload() {
		return { code: 204 } as const;
	}

	@Route("put", "/thing/{id}")
	@StreamedBody(64)
	async replace() {
		return { code: 204 } as const;
	}

	@Route("post", "/parsed")
	async parsed() {
		return { code: 204 } as const;
	}
}

type ControllerClass = new (...args: never[]) => unknown;

const applicationContext = (
	controllers: readonly ControllerClass[],
): INestApplicationContext => {
	const discovery = {
		getControllers: () => controllers.map((metatype) => ({ metatype })),
	};

	return {
		get: (token: unknown) => {
			if (token === DiscoveryService) {
				return discovery;
			}
			if (token === MetadataScanner) {
				return new MetadataScanner();
			}

			return new Reflector();
		},
	} as unknown as INestApplicationContext;
};

/** the platform hands the handler a readable, so the stub has to be one too */
const request = (chunks: readonly string[]): RequestStreamStub =>
	Readable.from(chunks) as RequestStreamStub;

/** what the interceptor is expected to have left behind */
const body = (stub: StreamedRequest): Readable => {
	const prepared = stub[ROUTE_BODY_STREAM];
	if (typeof prepared === "undefined") {
		throw new Error("interceptor did not prepare a body");
	}

	return prepared;
};

test("a route declaring a streamed body", (t: TestContext) => {
	t.test("defaults to the shared limit", (t: TestContext) => {
		t.assert.strictEqual(
			new Reflector().get(StreamedBody, Controller.prototype.upload),
			REQUEST_BODY_LIMIT,
		);
	});

	t.test("keeps a limit of its own", (t: TestContext) => {
		t.assert.strictEqual(
			new Reflector().get(StreamedBody, Controller.prototype.replace),
			64,
		);
	});

	t.test("is discoverable by its schema path", (t: TestContext) => {
		t.assert.deepStrictEqual(
			[...streamedRoutes(applicationContext([Controller]))],
			["/upload", "/thing/{id}"],
		);
	});
});

test("the parser bypass", (t: TestContext) => {
	const streamed = streamedRouteMatcher(new Set(["/upload", "/thing/{id}"]));
	const incoming = (url: string | undefined): IncomingMessage =>
		({ url }) as IncomingMessage;

	t.test("matches a declared path", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming("/upload")), true);
	});

	t.test("matches regardless of query", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming("/upload?retry=1")), true);
	});

	t.test("matches a templated path segment", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming("/thing/6f1a")), true);
	});

	t.test("does not match across segments", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming("/thing/6f1a/nested")), false);
	});

	t.test("does not match an undeclared path", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming("/parsed")), false);
		t.assert.strictEqual(streamed(incoming("/uploaded")), false);
	});

	t.test("tolerates a request without a url", (t: TestContext) => {
		t.assert.strictEqual(streamed(incoming(undefined)), false);
	});
});

test("the body interceptor", (t: TestContext) => {
	const interceptor = new InterceptorRouteBody(new Reflector());

	const next = (handle: CallHandler<unknown>["handle"]): CallHandler<unknown> =>
		({ handle }) as CallHandler<unknown>;

	t.test("leaves a route without a streamed body alone", (t: TestContext) => {
		const stub = request(["{}"]);

		interceptor.intercept(
			executionContext(Controller.prototype.parsed, stub),
			next(() => of("untouched")),
		);

		t.assert.strictEqual(stub[ROUTE_BODY_STREAM], undefined);
	});

	t.test("hands the handler a capped body", async (t: TestContext) => {
		const stub = request(["one", "two"]);

		const result = await firstValueFrom(
			interceptor.intercept(
				executionContext(Controller.prototype.upload, stub),
				next(() => of("handled")),
			),
		);

		t.assert.strictEqual(result, "handled");
		t.assert.strictEqual(await text(body(stub)), "onetwo");
	});

	t.test("fails the body once the limit is passed", async (t: TestContext) => {
		// `replace` caps at 64 bytes
		const stub = request(["a".repeat(40), "b".repeat(40)]);

		await t.assert.rejects(
			async () =>
				await firstValueFrom(
					interceptor.intercept(
						executionContext(Controller.prototype.replace, stub),
						// a handler that consumes the body, the way a streaming one does
						next(() => from(text(body(stub)))),
					),
				),
			(error: unknown) =>
				error instanceof PayloadTooLargeException && error.getStatus() === 413,
		);
	});

	t.test("leaves an unrelated failure as it is", async (t: TestContext) => {
		const stub = request(["{}"]);
		const failure = new Error("malformed submission");

		await t.assert.rejects(
			async () =>
				await firstValueFrom(
					interceptor.intercept(
						executionContext(Controller.prototype.upload, stub),
						next(() => throwError(() => failure)),
					),
				),
			(error: unknown) => error === failure,
		);
	});
});
