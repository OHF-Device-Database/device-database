import type { Maybe } from "../../../type/maybe";

/** e.g. `{ kind: "github", id: 1 }` */
export type IndexForgeAuthor = { kind: string; id: string | number };

export type IndexForgeCommit = {
	hash: string;
	tree: string;
	/** seconds since epoch */
	createdAt: number;
	/** human-facing location of the commit */
	url: string;
	author: Maybe<IndexForgeAuthor>;
};

/** blob within a tree, directories are implied by their contents */
export type IndexForgeEntry = { path: string; mode: string; hash: string };

/** read access to the repository an index is built from */
export const IndexForge = Symbol("IndexForge");
export interface IndexForge {
	/** hash of the tracked branch tip */
	head(): Promise<string>;
	/** first-parent ancestry of `hash` including itself, newest first */
	ancestry(hash: string): AsyncIterable<IndexForgeCommit>;
	/** blobs of a tree, recursively */
	tree(hash: string): Promise<IndexForgeEntry[]>;
	blob(hash: string): Promise<Buffer>;
}

/** caches blobs for the lifetime of the returned forge, they're content-addressed → never stale */
export const memoize = (forge: IndexForge): IndexForge => {
	const blobs = new Map<string, Promise<Buffer>>();

	return {
		head: () => forge.head(),
		ancestry: (hash) => forge.ancestry(hash),
		tree: (hash) => forge.tree(hash),
		blob: (hash) => {
			let pending = blobs.get(hash);
			if (typeof pending === "undefined") {
				pending = forge.blob(hash);
				blobs.set(hash, pending);
			}

			return pending;
		},
	};
};
