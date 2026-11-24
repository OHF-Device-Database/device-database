import { type TestContext, test } from "node:test";

import { paced } from "./paced";

import type { IndexFetch } from "./paced";

/** answers with scripted responses on a virtual clock, which sleeping advances */
const scripted = (
	responses: ({ status: number; headers?: Record<string, string> } | Error)[],
) => {
	let clock = 0;
	const requests: { input: string; at: number }[] = [];

	const fetch: IndexFetch = async (input) => {
		requests.push({ input, at: clock });
		const response = responses.shift() ?? { status: 200 };
		if (response instanceof Error) {
			throw response;
		}
		return new Response("body", response);
	};

	return {
		requests,
		fetch,
		sleep: async (ms: number) => {
			clock += ms;
		},
		now: () => clock,
	};
};

test("index paced", async (t: TestContext) => {
	await t.test("spaces out requests in order", async (t: TestContext) => {
		const s = scripted([]);
		const fetch = paced(s.fetch, { interval: 100, ...s });

		const responses = await Promise.all(
			["a", "b", "c"].map((input) => fetch(input)),
		);

		t.assert.deepStrictEqual(
			responses.map(({ status }) => status),
			[200, 200, 200],
		);
		t.assert.deepStrictEqual(s.requests, [
			{ input: "a", at: 0 },
			{ input: "b", at: 100 },
			{ input: "c", at: 200 },
		]);
	});

	await t.test("waits for exhausted limit to reset", async (t: TestContext) => {
		const s = scripted([
			{
				status: 200,
				headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "50" },
			},
		]);
		const fetch = paced(s.fetch, { interval: 100, ...s });

		await fetch("a");
		await fetch("b");

		t.assert.deepStrictEqual(
			s.requests.map(({ at }) => at),
			[0, 50_000],
		);
	});

	await t.test("retries rate limited requests", async (t: TestContext) => {
		const s = scripted([
			{ status: 429, headers: { "retry-after": "2" } },
			{
				status: 403,
				headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "5" },
			},
			// secondary limit without hint
			{ status: 429 },
			{ status: 429 },
			// not rate limited
			{ status: 403 },
		]);
		const fetch = paced(s.fetch, { interval: 100, ...s });

		t.assert.strictEqual((await fetch("a")).status, 403);
		// hintless backoff grows with attempts made so far, regardless of how earlier ones were limited
		t.assert.deepStrictEqual(
			s.requests.map(({ at }) => at),
			[0, 2_000, 5_000, 5_000 + 60_000 * 4, 245_000 + 60_000 * 8],
		);
	});

	await t.test("gives up after retries", async (t: TestContext) => {
		const limited = { status: 429, headers: { "retry-after": "1" } };
		const s = scripted([limited, limited, limited, limited]);
		const fetch = paced(s.fetch, { interval: 100, retries: 2, ...s });

		t.assert.strictEqual((await fetch("a")).status, 429);
		t.assert.strictEqual(s.requests.length, 3);
	});

	await t.test("continues past failed requests", async (t: TestContext) => {
		const s = scripted([new Error("offline")]);
		const fetch = paced(s.fetch, { interval: 100, ...s });

		const [a, b] = await Promise.allSettled([fetch("a"), fetch("b")]);
		t.assert.strictEqual(a.status, "rejected");
		t.assert.strictEqual(b.status, "fulfilled");
	});
});
