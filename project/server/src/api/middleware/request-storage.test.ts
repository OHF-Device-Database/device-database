import { randomUUID } from "node:crypto";

import { test } from "tap";

import { requestStorage } from "../../utility/request-storage";
import {
	MiddlewareRequestStorageDomain,
	middlewareRequestStorage,
} from "./request-storage";

test("request id injected", async (t) => {
	const requestId = randomUUID();

	const received = await new Promise((resolve) => {
		middlewareRequestStorage({ var: { requestId } } as any, async () => {
			const scope = requestStorage
				.getStore()
				?.scope<string>(MiddlewareRequestStorageDomain);
			resolve(scope?.get());
		});
	});

	t.same(received, requestId);
});
