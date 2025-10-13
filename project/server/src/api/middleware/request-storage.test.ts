import { randomUUID } from "node:crypto";
import { type TestContext, test } from "node:test";

import { requestStorage } from "../../utility/request-storage";
import {
	MiddlewareRequestStorageDomain,
	middlewareRequestStorage,
} from "./request-storage";

test("request id injected", async (t: TestContext) => {
	const requestId = randomUUID();

	const received = await new Promise((resolve) => {
		middlewareRequestStorage({ var: { requestId } } as any, async () => {
			const scope = requestStorage
				.getStore()
				?.scope<string>(MiddlewareRequestStorageDomain);
			resolve(scope?.get());
		});
	});

	t.assert.strictEqual(received, requestId);
});
