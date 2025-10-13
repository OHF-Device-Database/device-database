import { type TestContext, test } from "node:test";

import { postSnapshot } from "./handler";

import type { SnapshotSnapshot } from "../../../service/snapshot";

test("email validation", async (t: TestContext) => {
	const primed = postSnapshot({
		snapshot: {
			import: async () => {
				return null as unknown as SnapshotSnapshot;
			},
			reexamine: async () => {},
		},
	});

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@bar.com", data: {} },
			{ raw: { requestBody: undefined } },
		);
		t.assert.strictEqual(result.code, 400);
	}

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@nabucasa.com", data: {} },
			{ raw: { requestBody: undefined } },
		);
		t.assert.strictEqual(result.code, 200);
	}

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@openhomefoundation.org", data: {} },
			{ raw: { requestBody: undefined } },
		);
		t.assert.strictEqual(result.code, 200);
	}
});
