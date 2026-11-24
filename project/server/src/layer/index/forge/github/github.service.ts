import { createHmac, timingSafeEqual } from "node:crypto";

import { Schema } from "effect";

import { isSome } from "../../../../type/maybe";

import type { Config } from "../../../config/config.module";
import type { IndexFetch } from "../../paced";
import type { IndexForge, IndexForgeCommit, IndexForgeEntry } from "../base";

export type IndexForgeGithubFetch = IndexFetch;

export type IndexForgeGithubConfig = NonNullable<Config["index"]["github"]>;

export class IndexGithubRequestError extends Error {
	constructor(
		public path: string,
		public status: number,
		public body: string,
	) {
		super(`github request <${path}> failed with <${status}>`);
		Object.setPrototypeOf(this, IndexGithubRequestError.prototype);
	}
}

export class IndexGithubTreeTruncatedError extends Error {
	constructor(public hash: string) {
		super(`tree <${hash}> exceeds what github lists recursively`);
		Object.setPrototypeOf(this, IndexGithubTreeTruncatedError.prototype);
	}
}

const GithubRef = Schema.Struct({
	object: Schema.Struct({ sha: Schema.String }),
});

const GithubCommit = Schema.Struct({
	sha: Schema.String,
	commit: Schema.Struct({
		tree: Schema.Struct({ sha: Schema.String }),
		committer: Schema.Struct({ date: Schema.String }),
	}),
	// absent when the commit email isn't linked to an account
	author: Schema.NullOr(Schema.Struct({ id: Schema.optional(Schema.Number) })),
	parents: Schema.Array(Schema.Struct({ sha: Schema.String })),
});
type GithubCommit = typeof GithubCommit.Type;

const GithubTree = Schema.Struct({
	truncated: Schema.Boolean,
	tree: Schema.Array(
		Schema.Struct({
			path: Schema.String,
			mode: Schema.String,
			type: Schema.String,
			sha: Schema.String,
		}),
	),
});

const GithubBlob = Schema.Struct({
	content: Schema.String,
	encoding: Schema.Literal("base64", "utf-8"),
});

export class IndexForgeGithub implements IndexForge {
	constructor(
		private readonly config: IndexForgeGithubConfig,
		private readonly fetch: IndexForgeGithubFetch = (input, init) =>
			globalThis.fetch(input, init),
	) {}

	// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
	genuine(signature: string, body: Buffer): boolean {
		const expected = Buffer.from(
			`sha256=${createHmac("sha256", this.config.callback.secret).update(body).digest("hex")}`,
			"utf-8",
		);
		const received = Buffer.from(signature, "utf-8");

		return (
			expected.length === received.length && timingSafeEqual(expected, received)
		);
	}

	/** whether a push to `ref` concerns the index */
	tracks(ref: string): boolean {
		return ref === `refs/heads/${this.config.branch}`;
	}

	private async api<A, I>(
		schema: Schema.Schema<A, I>,
		path: string,
	): Promise<A> {
		const response = await this.fetch(
			`https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}${path}`,
			{
				headers: {
					accept: "application/vnd.github+json",
					"user-agent": "device-database",
					"x-github-api-version": "2022-11-28",
					...(isSome(this.config.token)
						? { authorization: `Bearer ${this.config.token}` }
						: {}),
				},
			},
		);

		if (!response.ok) {
			throw new IndexGithubRequestError(
				path,
				response.status,
				await response.text(),
			);
		}

		return Schema.decodeUnknownSync(schema)(await response.json());
	}

	async head(): Promise<string> {
		return (
			await this.api(
				GithubRef,
				`/git/ref/heads/${this.config.branch.split("/").map(encodeURIComponent).join("/")}`,
			)
		).object.sha;
	}

	async *ancestry(hash: string): AsyncIterable<IndexForgeCommit> {
		// listing pages through ancestry in bulk, as opposed to one request per commit
		const listed = new Map<string, GithubCommit>();
		let page = 0;
		let exhausted = false;

		let current: string | undefined = hash;
		while (typeof current !== "undefined") {
			while (!listed.has(current) && !exhausted) {
				page += 1;
				const commits = await this.api(
					Schema.Array(GithubCommit),
					`/commits?sha=${hash}&per_page=100&page=${page}`,
				);
				for (const commit of commits) {
					listed.set(commit.sha, commit);
				}
				exhausted = commits.length < 100;
			}

			const commit: GithubCommit =
				listed.get(current) ??
				(await this.api(GithubCommit, `/commits/${current}`));

			yield {
				hash: commit.sha,
				tree: commit.commit.tree.sha,
				createdAt: Math.floor(Date.parse(commit.commit.committer.date) / 1000),
				url: `https://github.com/${this.config.owner}/${this.config.repository}/commit/${commit.sha}`,
				author:
					typeof commit.author?.id !== "undefined"
						? { kind: "github", id: commit.author.id }
						: null,
			};

			current = commit.parents[0]?.sha;
		}
	}

	async tree(hash: string): Promise<IndexForgeEntry[]> {
		const tree = await this.api(GithubTree, `/git/trees/${hash}?recursive=1`);
		if (tree.truncated) {
			throw new IndexGithubTreeTruncatedError(hash);
		}

		// submodules are not followed
		return tree.tree
			.filter((item) => item.type === "blob")
			.map(({ path, mode, sha }) => ({ path, mode, hash: sha }));
	}

	async blob(hash: string): Promise<Buffer> {
		const { content, encoding } = await this.api(
			GithubBlob,
			`/git/blobs/${hash}`,
		);
		return Buffer.from(content, encoding === "base64" ? "base64" : "utf-8");
	}
}
