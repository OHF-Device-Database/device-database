import { createHmac } from "node:crypto";
import { type TestContext, test } from "node:test";

import {
	IndexForgeGithub,
	IndexGithubRequestError,
	IndexGithubTreeTruncatedError,
} from "./github.service";

import type { IndexForgeGithubFetch } from "./github.service";

const config = {
	owner: "owner",
	repository: "repository",
	branch: "main",
	token: null,
	callback: { secret: "secret" },
};

/** serves json bodies by path and query, anything else is missing */
const fake = (routes: Record<string, unknown>) => {
	const requests: string[] = [];
	const headers: Record<string, string>[] = [];

	const fetch: IndexForgeGithubFetch = async (input, init) => {
		const url = new URL(input);
		const path = `${url.pathname.replace(/^\/repos\/owner\/repository/, "")}${url.search}`;
		requests.push(path);
		headers.push(init?.headers ?? {});

		return path in routes
			? new Response(JSON.stringify(routes[path]))
			: new Response("missing", { status: 404 });
	};

	return { requests, headers, fetch };
};

const commit = (
	sha: string,
	parents: string[],
	{ author = { id: 1 } }: { author?: { id?: number } | null } = {},
) => ({
	sha,
	commit: {
		tree: { sha: `tree-${sha}` },
		committer: { date: "2026-11-20T12:00:00Z" },
	},
	author,
	parents: parents.map((sha) => ({ sha })),
});

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
	const collected: T[] = [];
	for await (const item of iterable) {
		collected.push(item);
	}
	return collected;
};

test("index forge github", async (t: TestContext) => {
	await t.test("resolves head", async (t: TestContext) => {
		{
			const github = fake({
				"/git/ref/heads/release/v1": { object: { sha: "a" } },
			});
			const forge = new IndexForgeGithub(
				{ ...config, branch: "release/v1", token: "token" },
				github.fetch,
			);

			t.assert.strictEqual(await forge.head(), "a");
			t.assert.strictEqual(github.headers[0].authorization, "Bearer token");
		}

		{
			const github = fake({ "/git/ref/heads/main": { object: { sha: "a" } } });
			await new IndexForgeGithub(config, github.fetch).head();

			t.assert.strictEqual(github.headers[0].authorization, undefined);
		}
	});

	await t.test("walks first-parent ancestry", async (t: TestContext) => {
		// `side` is merged into `c`, listing interleaves it
		const github = fake({
			"/commits?sha=c&per_page=100&page=1": [
				commit("c", ["b", "side"]),
				commit("side", ["a"]),
				commit("b", ["a"], { author: null }),
				commit("a", [], { author: {} }),
			],
		});
		const forge = new IndexForgeGithub(config, github.fetch);

		const createdAt = Date.parse("2026-11-20T12:00:00Z") / 1000;
		t.assert.deepStrictEqual(await collect(forge.ancestry("c")), [
			{
				hash: "c",
				tree: "tree-c",
				createdAt,
				url: "https://github.com/owner/repository/commit/c",
				author: { kind: "github", id: 1 },
			},
			{
				hash: "b",
				tree: "tree-b",
				createdAt,
				url: "https://github.com/owner/repository/commit/b",
				author: null,
			},
			{
				hash: "a",
				tree: "tree-a",
				createdAt,
				url: "https://github.com/owner/repository/commit/a",
				author: null,
			},
		]);
		t.assert.deepStrictEqual(github.requests, [
			"/commits?sha=c&per_page=100&page=1",
		]);
	});

	await t.test(
		"pages through ancestry, fetching unlisted commits",
		async (t: TestContext) => {
			const shas = Array.from({ length: 150 }, (_, idx) => `c${idx}`);
			const chain = shas.map((sha, idx) =>
				commit(sha, idx === 0 ? [] : [shas[idx - 1]]),
			);
			const listing = chain.toReversed().filter(({ sha }) => sha !== "c10");

			const github = fake({
				"/commits?sha=c149&per_page=100&page=1": listing.slice(0, 100),
				"/commits?sha=c149&per_page=100&page=2": listing.slice(100),
				"/commits/c10": chain[10],
			});
			const forge = new IndexForgeGithub(config, github.fetch);

			// lazily → stopping early leaves remaining pages untouched
			for await (const _ of forge.ancestry("c149")) {
				break;
			}
			t.assert.deepStrictEqual(github.requests, [
				"/commits?sha=c149&per_page=100&page=1",
			]);

			github.requests.length = 0;
			t.assert.deepStrictEqual(
				(await collect(forge.ancestry("c149"))).map(({ hash }) => hash),
				shas.toReversed(),
			);
			t.assert.deepStrictEqual(github.requests, [
				"/commits?sha=c149&per_page=100&page=1",
				"/commits?sha=c149&per_page=100&page=2",
				"/commits/c10",
			]);
		},
	);

	await t.test("lists blobs of trees", async (t: TestContext) => {
		const github = fake({
			"/git/trees/t?recursive=1": {
				truncated: false,
				tree: [
					{ path: "entities", mode: "040000", type: "tree", sha: "1" },
					{ path: "entities/name", mode: "100644", type: "blob", sha: "2" },
					{ path: "entities/link", mode: "120000", type: "blob", sha: "3" },
					{ path: "vendored", mode: "160000", type: "commit", sha: "4" },
				],
			},
			"/git/trees/truncated?recursive=1": { truncated: true, tree: [] },
		});
		const forge = new IndexForgeGithub(config, github.fetch);

		t.assert.deepStrictEqual(await forge.tree("t"), [
			{ path: "entities/name", mode: "100644", hash: "2" },
			{ path: "entities/link", mode: "120000", hash: "3" },
		]);
		await t.assert.rejects(
			forge.tree("truncated"),
			IndexGithubTreeTruncatedError,
		);
	});

	await t.test("decodes blobs", async (t: TestContext) => {
		const github = fake({
			"/git/blobs/base64": {
				content: Buffer.from("ä").toString("base64"),
				encoding: "base64",
			},
			"/git/blobs/utf-8": { content: "ä", encoding: "utf-8" },
		});
		const forge = new IndexForgeGithub(config, github.fetch);

		t.assert.strictEqual((await forge.blob("base64")).toString("utf-8"), "ä");
		t.assert.strictEqual((await forge.blob("utf-8")).toString("utf-8"), "ä");
	});

	await t.test("surfaces failed requests", async (t: TestContext) => {
		const forge = new IndexForgeGithub(config, fake({}).fetch);

		await t.assert.rejects(
			forge.blob("absent"),
			(error) =>
				error instanceof IndexGithubRequestError &&
				error.status === 404 &&
				error.body === "missing",
		);
	});

	await t.test("verifies webhook signature", (t: TestContext) => {
		const forge = new IndexForgeGithub(config, fake({}).fetch);

		const body = Buffer.from('{"ref":"refs/heads/main"}');
		const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

		t.assert.strictEqual(forge.genuine(signature, body), true);
		t.assert.strictEqual(forge.genuine(signature, Buffer.from("{}")), false);
		t.assert.strictEqual(forge.genuine("sha256=00", body), false);
		t.assert.strictEqual(forge.tracks("refs/heads/main"), true);
		t.assert.strictEqual(forge.tracks("refs/heads/other"), false);
	});
});
