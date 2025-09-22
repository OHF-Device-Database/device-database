import { test } from "tap";

import { postSnapshot } from "./handler";

import type { SnapshotSnapshot } from "../../../service/snapshot";

test("email validation", async (t) => {
	const primed = postSnapshot({
		snapshot: {
			import: async () => {
				return null as unknown as SnapshotSnapshot;
			},
		},
	});

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@bar.com", data: {} },
		);
		t.equal(result.code, 400);
	}

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@nabucasa.com", data: {} },
		);
		t.equal(result.code, 200);
	}

	{
		const result = await primed.for.handler(
			{},
			{ contact: "foo@openhomefoundation.org", data: {} },
		);
		t.equal(result.code, 200);
	}
});
