import { type TestContext, test } from "node:test";

import { NotFoundException, StreamableFile } from "@nestjs/common";

import { ControllerOpenapiExplorer } from "./explorer.controller";
import { EXPLORER_PATH, ServiceOpenapiExplorer } from "./explorer.service";

const service = new ServiceOpenapiExplorer();

const controller = () => new ControllerOpenapiExplorer(service);

test("mount point", (t: TestContext) => {
	t.assert.deepStrictEqual(controller().index(), {
		url: "/openapi/explorer/index.html",
	});
});

test("initializer", (t: TestContext) => {
	t.assert.strictEqual(
		controller().initializer(),
		service.initializer(`/${EXPLORER_PATH}`),
	);
});

test("schema", (t: TestContext) => {
	t.assert.deepStrictEqual(controller().schema(), service.schema);
});

test("assets", async (t: TestContext) => {
	await t.test("present", async (t: TestContext) => {
		const asset = await controller().asset("swagger-ui.css");

		t.assert.ok(asset instanceof StreamableFile);
		t.assert.strictEqual(asset.getHeaders().type, "text/css; charset=utf-8");

		asset.getStream().destroy();
	});

	await t.test("missing", async (t: TestContext) => {
		await t.assert.rejects(
			controller().asset("absent.js"),
			(error: unknown) => error instanceof NotFoundException,
		);
	});

	await t.test("attempted path traversal", async (t: TestContext) => {
		for (const name of ["../package.json", "..", "nested/index.html"]) {
			await t.assert.rejects(
				controller().asset(name),
				(error: unknown) => error instanceof NotFoundException,
			);
		}
	});
});
