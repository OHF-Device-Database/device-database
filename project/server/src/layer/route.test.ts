import { type TestContext, test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { Schema } from "effect";

import { _Route, ROUTE_DECODED, RouteSchemaMetadata } from "./route";
import { intercept, invoke, routeArguments } from "./test";

import type { _Implements } from "./schema";
import type { RequestStub } from "./test";

const declaredArguments = (
	controller: new (...args: never[]) => unknown,
	propertyKey: string,
): readonly (readonly [number, unknown])[] =>
	routeArguments(controller, propertyKey).map(
		({ index, data }) => [index, data] as const,
	);

test("an operation declaring parameters and a request body", (t: TestContext) => {
	type Paths = {
		readonly "/command": {
			readonly post: {
				readonly parameters: {
					readonly header: {
						readonly "x-signature": string;
						readonly "x-timestamp": string;
					};
				};
				readonly requestBody: {
					readonly content: {
						readonly "application/json": {
							readonly command: string;
							readonly text: string;
						};
					};
				};
				readonly responses: {
					readonly 200: {
						headers: { readonly [name: string]: unknown };
						content: {
							readonly "application/json": { readonly type: string };
						};
					};
				};
			};
		};
	};

	const Parameters = Schema.Struct({
		header: Schema.Struct({
			"x-signature": Schema.String,
			"x-timestamp": Schema.NumberFromString,
		}),
	});
	type Parameters = typeof Parameters.Type;

	const RequestBody = Schema.Struct({
		command: Schema.String,
		text: Schema.Trim,
	});
	type RequestBody = typeof RequestBody.Type;

	const Route = _Route<Paths>();

	class Controller implements _Implements<Paths, "/command"> {
		received: readonly unknown[] = [];

		@Route("post", "/command", {
			parameters: Parameters,
			requestBody: RequestBody,
		})
		// a decorator cannot contextually type the parameters of the method it
		// decorates, so they are annotated with what the schemas decode to; the
		// annotations are checked against `HandlerArguments`
		async post(parameters: Parameters, requestBody: RequestBody) {
			this.received = [parameters, requestBody];
			return {
				code: 200,
				contentType: "application/json",
				body: { type: "ephemeral" },
			} as const;
		}
	}

	const request: RequestStub = {
		headers: { "x-signature": "v0=deadbeef", "x-timestamp": "1700000000" },
		body: { command: "/device", text: "  shelly  " },
	};

	t.test(
		"hands both decoded sections to the handler",
		async (t: TestContext) => {
			const controller = new Controller();

			const response = await invoke(controller, "post", {
				...request,
			});

			t.assert.deepStrictEqual(controller.received, [
				{
					header: {
						"x-signature": "v0=deadbeef",
						// transformed by the schema
						"x-timestamp": 1700000000,
					},
				},
				{ command: "/device", text: "shelly" },
			]);
			t.assert.deepStrictEqual(response, {
				code: 200,
				contentType: "application/json",
				body: { type: "ephemeral" },
			});
		},
	);

	t.test("rejects parameters the schema does not accept", (t: TestContext) => {
		const controller = new Controller();

		t.assert.throws(
			() =>
				invoke(controller, "post", {
					...request,
					headers: { "x-signature": "v0=deadbeef" },
				}),
			(error: unknown) =>
				error instanceof BadRequestException &&
				error.getStatus() === 400 &&
				error.message.startsWith("invalid parameters:"),
		);
		t.assert.deepStrictEqual(controller.received, []);
	});

	t.test(
		"rejects a request body the schema does not accept",
		(t: TestContext) => {
			const controller = new Controller();

			t.assert.throws(
				() =>
					invoke(controller, "post", {
						...request,
						body: { command: "/device" },
					}),
				(error: unknown) =>
					error instanceof BadRequestException &&
					error.getStatus() === 400 &&
					error.message.startsWith("invalid request body:"),
			);
			t.assert.deepStrictEqual(controller.received, []);
		},
	);

	t.test(
		"records the schema metadata the response interceptor reads",
		(t: TestContext) => {
			t.assert.deepStrictEqual(
				new Reflector().get(RouteSchemaMetadata, Controller.prototype.post),
				{ path: "/command", method: "post" },
			);
		},
	);

	t.test(
		"binds both sections to the positions the handler declares",
		(t: TestContext) => {
			t.assert.deepStrictEqual(declaredArguments(Controller, "post"), [
				[0, "parameters"],
				[1, "requestBody"],
			]);
		},
	);
});

test("an operation declaring parameters only", (t: TestContext) => {
	type Paths = {
		readonly "/search": {
			readonly get: {
				readonly parameters: {
					readonly query: {
						readonly q: string;
						readonly tag?: readonly string[];
					};
				};
				readonly responses: {
					readonly 204: { headers: { readonly [name: string]: unknown } };
				};
			};
		};
	};

	const Parameters = Schema.Struct({
		query: Schema.Struct({
			q: Schema.Trim,
			// a repeatable query parameter arrives in unary form when it occurs once
			tag: Schema.optional(
				Schema.Union(Schema.String, Schema.Array(Schema.String)),
			),
		}),
	});
	type Parameters = typeof Parameters.Type;

	const Route = _Route<Paths>();

	class Controller implements _Implements<Paths, "/search"> {
		received: unknown = undefined;

		@Route("get", "/search", { parameters: Parameters })
		async get(parameters: Parameters) {
			this.received = parameters;
			return { code: 204 } as const;
		}
	}

	t.test(
		"hands the sole decoded section to the handler",
		async (t: TestContext) => {
			const controller = new Controller();

			await invoke(controller, "get", {
				query: { q: " shelly ", tag: "relay" },
				cookies: { session: "parsed" },
			});

			t.assert.deepStrictEqual(controller.received, {
				query: { q: "shelly", tag: "relay" },
			});
		},
	);

	t.test("does not provide request body when not given", (t: TestContext) => {
		t.assert.deepStrictEqual(declaredArguments(Controller, "get"), [
			[0, "parameters"],
		]);
	});
});

test("an operation declaring no codec", (t: TestContext) => {
	type Paths = {
		readonly "/thing/{id}": {
			readonly get: {
				readonly parameters: { readonly path: { readonly id: string } };
				readonly responses: {
					readonly 204: { headers: { readonly [name: string]: unknown } };
				};
			};
		};
	};

	const Route = _Route<Paths>();

	class Controller implements _Implements<Paths, "/thing/{id}"> {
		@Route("get", "/thing/{id}")
		async get() {
			return { code: 204 } as const;
		}
	}

	t.test("templates the path the way nest expects", (t: TestContext) => {
		t.assert.strictEqual(
			Reflect.getMetadata(PATH_METADATA, Controller.prototype.get),
			"/thing/:id",
		);
	});

	t.test("binds no parameters at all", (t: TestContext) => {
		t.assert.deepStrictEqual(declaredArguments(Controller, "get"), []);
	});

	t.test("is left alone by the request interceptor", (t: TestContext) => {
		const request: RequestStub = { params: { id: "a" } };

		intercept(Controller.prototype.get, request);

		t.assert.strictEqual(request[ROUTE_DECODED], undefined);
	});
});
