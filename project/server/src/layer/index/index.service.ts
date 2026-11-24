import { randomUUID } from "node:crypto";
import { posix } from "node:path";

import {
	Inject,
	Injectable,
	type OnApplicationBootstrap,
} from "@nestjs/common";
import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { logger as parentLogger } from "../../logger";
import {
	deleteHeadBrand,
	deleteHeadCategory,
	deleteHeadDevice,
	deleteHeadTrait,
} from "../../service/database/query/index/head-delete";
import {
	insertHeadBrand,
	insertHeadCategory,
	insertHeadDevice,
	insertHeadTrait,
} from "../../service/database/query/index/head-insert";
import { deleteHistorySucceeding } from "../../service/database/query/index/history-delete";
import {
	getHistory,
	getHistoryLatest,
	getHistoryTraits,
} from "../../service/database/query/index/history-get";
import {
	insertHistory,
	insertHistoryChangeEntity,
	insertHistoryChangeTrait,
} from "../../service/database/query/index/history-insert";
import { isNone, isSome, type Maybe } from "../../type/maybe";
import { DatabaseIndex } from "../database/database.module";
import { IndexForge, memoize } from "./forge/base";

import type { IDatabase } from "../../service/database";
import type { IndexForgeCommit, IndexForgeEntry } from "./forge/base";

const logger = parentLogger.child({ label: "index" });

const Source = Schema.Union(
	Schema.Struct({ kind: Schema.Literal("database"), value: Schema.String }),
	Schema.Struct({ kind: Schema.Literal("ha-telemetry") }),
	Schema.Struct({ kind: Schema.Literal("inferred") }),
	Schema.Struct({
		kind: Schema.Literal("community"),
		url: Schema.optional(Schema.String),
	}),
);
type Source = typeof Source.Type;

/** contents of a trait value file */
const TraitValue = Schema.parseJson(
	Schema.Struct({ value: Schema.Unknown, source: Source }),
);

const MODE_SYMLINK = "120000";

type EntityKind = "brand" | "device" | "category";

type Located = {
	kind: EntityKind;
	id: string;
	/** path of entity directory */
	root: string;
	/** path segments below entity directory */
	rest: string[];
};

/** maps a repository path onto the entity it belongs to */
const locate = (path: string): Maybe<Located> => {
	const segments = path.split("/");
	if (segments[0] !== "entities") {
		return null;
	}

	switch (segments[1]) {
		case "brands":
		case "devices": {
			// sharded by leading identifier characters → `<2>/<2>/<uuid>`
			if (segments.length < 5) {
				return null;
			}

			return {
				kind: segments[1] === "brands" ? "brand" : "device",
				id: segments[4],
				root: segments.slice(0, 5).join("/"),
				rest: segments.slice(5),
			};
		}
		case "categories": {
			if (segments.length < 3) {
				return null;
			}

			// nested categories alternate between name and `categories` segments
			let end = 2;
			while (segments[end + 1] === "categories" && end + 2 < segments.length) {
				end += 2;
			}

			return {
				kind: "category",
				id: segments
					.slice(2, end + 1)
					.filter((_, idx) => idx % 2 === 0)
					.join("/"),
				root: segments.slice(0, end + 1).join("/"),
				rest: segments.slice(end + 1),
			};
		}
	}

	return null;
};

type Entry = { mode: string; hash: string };

/** files below `<entity>/<trait>` */
type Group = {
	kind: EntityKind;
	id: string;
	trait: string;
	/** path of trait link / directory */
	path: string;
	entries: Map<string, Entry>;
};

const VALUE = "value.json";

const group = (entries: IndexForgeEntry[]): Map<string, Group> => {
	const groups = new Map<string, Group>();

	for (const item of entries) {
		const located = locate(item.path);
		if (
			isNone(located) ||
			located.rest.length === 0 ||
			located.rest[0].startsWith(".")
		) {
			continue;
		}

		const trait = located.rest[0];
		const key = JSON.stringify([located.kind, located.id, trait]);

		let g = groups.get(key);
		if (typeof g === "undefined") {
			g = {
				kind: located.kind,
				id: located.id,
				trait,
				path: `${located.root}/${trait}`,
				entries: new Map(),
			};
			groups.set(key, g);
		}

		g.entries.set(item.path, { mode: item.mode, hash: item.hash });
	}

	return groups;
};

/** solely what determines the {@link Layout} of a trait, remaining fields are persisted as is */
const TraitDefinition = Schema.Struct({
	type: Schema.String,
	resource: Schema.optional(Schema.String),
	localized: Schema.optional(Schema.Boolean),
	pattern: Schema.optional(
		Schema.Struct({ multiple: Schema.optional(Schema.Boolean) }),
	),
});

/**
 * how values of a trait are laid out below `<entity>/<trait>`
 *
 * - `value`: `value.json`
 * - `values`: `<locale>/value.json`
 * - `link`: symlink in place of the trait directory
 * - `links`: symlinks in `ordered/`, ordered by name, i.e. `1`, `2`, …
 * - `tree`: arbitrary nesting, leaves are links or blobs (e.g. photos)
 */
type Layout = "value" | "values" | "link" | "links" | "tree";

const layout = (definition: unknown): Maybe<Layout> => {
	const decoded = Schema.decodeUnknownEither(TraitDefinition)(definition);
	if (isLeft(decoded)) {
		return null;
	}

	const { type, resource, localized, pattern } = decoded.right;
	switch (type) {
		case "picker":
			// static options are picked by id
			if (typeof resource !== "undefined" && resource !== "none") {
				return pattern?.multiple === true ? "links" : "link";
			}
			break;
		case "photos":
			return "tree";
	}

	return localized === true ? "values" : "value";
};

type DefinitionFile = { kind: EntityKind; trait: string; hash: string };
type LocalizationFile = DefinitionFile & { locale: string };

/** file as of a commit, malformed files retain their last well-formed contents */
type Tracked<F, V> = F & {
	/** `null` while no well-formed contents have been encountered */
	valid: Maybe<V>;
};

type Definition = Tracked<DefinitionFile, { value: unknown; layout: Layout }>;
type Localization = Tracked<LocalizationFile, { value: unknown }>;

const ENTITY_DIRECTORIES: Record<string, EntityKind> = {
	brands: "brand",
	devices: "device",
	categories: "category",
};

/** `traits/<entity>/<trait>/definition.json` files, keyed by `[kind, trait]` */
const definitions = (
	entries: IndexForgeEntry[],
): Map<string, DefinitionFile> => {
	const files = new Map<string, DefinitionFile>();

	for (const item of entries) {
		const segments = item.path.split("/");
		const kind = ENTITY_DIRECTORIES[segments[1]];
		if (
			segments.length !== 4 ||
			segments[0] !== "traits" ||
			segments[3] !== "definition.json" ||
			typeof kind === "undefined" ||
			item.mode === MODE_SYMLINK
		) {
			continue;
		}

		files.set(JSON.stringify([kind, segments[2]]), {
			kind,
			trait: segments[2],
			hash: item.hash,
		});
	}

	return files;
};

/** `traits/<entity>/<trait>/locale/<lang>.json` files, keyed by `[kind, trait, lang]` */
const localizations = (
	entries: IndexForgeEntry[],
): Map<string, LocalizationFile> => {
	const files = new Map<string, LocalizationFile>();

	for (const item of entries) {
		const segments = item.path.split("/");
		const kind = ENTITY_DIRECTORIES[segments[1]];
		if (
			segments.length !== 5 ||
			segments[0] !== "traits" ||
			segments[3] !== "locale" ||
			!segments[4].endsWith(".json") ||
			typeof kind === "undefined" ||
			item.mode === MODE_SYMLINK
		) {
			continue;
		}

		const locale = segments[4].slice(0, -".json".length);
		files.set(JSON.stringify([kind, segments[2], locale]), {
			kind,
			trait: segments[2],
			locale,
			hash: item.hash,
		});
	}

	return files;
};

type Diff =
	| { kind: "removed" }
	| { kind: "added" | "modified"; value: unknown };

/** diffs files by blob, `parse` yields `null` for malformed contents */
const track = async <F extends { hash: string }, V extends { value: unknown }>(
	before: Map<string, Tracked<F, V>>,
	after: Map<string, F>,
	parse: (file: F) => Promise<Maybe<V>>,
): Promise<{
	tracked: Map<string, Tracked<F, V>>;
	diffs: { file: F; diff: Diff }[];
}> => {
	const tracked = new Map<string, Tracked<F, V>>();
	const diffs: { file: F; diff: Diff }[] = [];

	for (const [key, file] of after) {
		const previous = before.get(key);
		if (previous?.hash === file.hash) {
			tracked.set(key, previous);
			continue;
		}

		const valid = await parse(file);
		const retained = previous?.valid ?? null;
		tracked.set(key, { ...file, valid: valid ?? retained });
		if (isSome(valid)) {
			diffs.push({
				file,
				diff: {
					kind: isNone(retained) ? "added" : "modified",
					value: valid.value,
				},
			});
		}
	}

	for (const [key, previous] of before) {
		if (!after.has(key) && isSome(previous.valid)) {
			diffs.push({ file: previous, diff: { kind: "removed" } });
		}
	}

	return { tracked, diffs };
};

/** single value of a trait, localized traits carry one per locale */
type Unit = Group & { locale: string | null; layout: Layout };

/** splits groups into units according to their trait's layout, traits lacking a definition are omitted */
const expand = (
	groups: Map<string, Group>,
	known: Map<string, Definition>,
): { units: Map<string, Unit>; missing: Set<string> } => {
	const units = new Map<string, Unit>();
	const missing = new Set<string>();

	for (const g of groups.values()) {
		const valid = known.get(JSON.stringify([g.kind, g.trait]))?.valid ?? null;
		if (isNone(valid)) {
			missing.add(`${g.kind}/${g.trait}`);
			continue;
		}

		const { layout } = valid;
		if (layout !== "values") {
			units.set(JSON.stringify([g.kind, g.id, g.trait, null]), {
				...g,
				locale: null,
				layout,
			});
			continue;
		}

		for (const [path, entry] of g.entries) {
			const segments = path.slice(g.path.length + 1).split("/");
			if (segments.length !== 2 || segments[1] !== VALUE) {
				continue;
			}

			units.set(JSON.stringify([g.kind, g.id, g.trait, segments[0]]), {
				...g,
				entries: new Map([[path, entry]]),
				locale: segments[0],
				layout,
			});
		}
	}

	return { units, missing };
};

/** nodes keyed by consecutive integers (`1`, `2`, …) are ordered → arrays */
const arrayify = (node: unknown): unknown => {
	if (typeof node !== "object" || node === null) {
		return node;
	}

	const entries = Object.entries(node);
	if (entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key))) {
		return entries
			.toSorted(([a], [b]) => Number(a) - Number(b))
			.map(([, value]) => arrayify(value));
	}

	return Object.fromEntries(
		entries.map(([key, value]) => [key, arrayify(value)]),
	);
};

type Materialized = { value: unknown; source: Source };

/** resolves a link of `unit` → id of another entity, path within the trait, trait, or path as is */
const reference = async (
	unit: Unit,
	path: string,
	entry: Entry,
	forge: Pick<IndexForge, "blob">,
): Promise<string> => {
	const target = (await forge.blob(entry.hash)).toString("utf-8");
	const resolved = posix.join(posix.dirname(path), target);

	const located = locate(resolved);
	if (isSome(located)) {
		// another entity
		if (located.rest.length === 0) {
			return located.id;
		}
		// within the same trait, e.g. `images/ordered/1 -> ../originals/cover.png`
		if (resolved.startsWith(`${unit.path}/`)) {
			return posix.relative(unit.path, resolved);
		}
	}

	if (resolved.startsWith("traits/")) {
		return resolved.slice("traits/".length);
	}

	return resolved;
};

/** `null` when malformed */
type Reader = (
	unit: Unit,
	context: {
		forge: Pick<IndexForge, "blob">;
		/** links and directories don't carry a source of their own */
		community: Source;
	},
) => Promise<Maybe<Materialized>>;

/** value file at `path`, carrying its own source */
const valueFile =
	(path: (unit: Unit) => string): Reader =>
	async (unit, { forge }) => {
		const file = unit.entries.get(path(unit));
		if (typeof file === "undefined" || file.mode === MODE_SYMLINK) {
			return null;
		}

		const decoded = Schema.decodeUnknownEither(TraitValue)(
			(await forge.blob(file.hash)).toString("utf-8"),
		);
		return decoded._tag === "Right" &&
			typeof decoded.right.value !== "undefined"
			? decoded.right
			: null;
	};

const readers: Record<Layout, Reader> = {
	value: valueFile((unit) => `${unit.path}/${VALUE}`),
	values: valueFile((unit) => `${unit.path}/${unit.locale}/${VALUE}`),
	link: async (unit, { forge, community }) => {
		const entry = unit.entries.get(unit.path);
		if (typeof entry === "undefined" || entry.mode !== MODE_SYMLINK) {
			return null;
		}

		return {
			value: await reference(unit, unit.path, entry, forge),
			source: community,
		};
	},
	links: async (unit, { forge, community }) => {
		const prefix = `${unit.path}/ordered/`;
		const links = [...unit.entries]
			.filter(([path]) => path.startsWith(prefix))
			.map(([path, entry]) => [path.slice(prefix.length), path, entry] as const)
			.filter(
				([name, , entry]) => /^\d+$/.test(name) && entry.mode === MODE_SYMLINK,
			)
			.toSorted(([a], [b]) => Number(a) - Number(b));
		if (links.length === 0) {
			return null;
		}

		return {
			value: await Promise.all(
				links.map(([, path, entry]) => reference(unit, path, entry, forge)),
			),
			source: community,
		};
	},
	tree: async (unit, { forge, community }) => {
		// nested object, leaves are link references or blob hashes
		const nested: Record<string, unknown> = {};
		for (const [path, entry] of unit.entries) {
			const segments = path.slice(unit.path.length + 1).split("/");
			if (segments[0] === "") {
				continue;
			}

			let node = nested;
			for (const segment of segments.slice(0, -1)) {
				node[segment] ??= {};
				node = node[segment] as Record<string, unknown>;
			}

			node[segments[segments.length - 1]] =
				entry.mode === MODE_SYMLINK
					? await reference(unit, path, entry, forge)
					: entry.hash;
		}

		if (Object.keys(nested).length === 0) {
			return null;
		}

		return { value: arrayify(nested), source: community };
	},
};

type Change = {
	kind: EntityKind;
	id: string;
	trait: string;
	locale: string | null;
	change: Diff;
	source: Source;
};

type TraitChange = {
	kind: EntityKind;
	trait: string;
	/** `null` for `definition.json`, `<lang>` for `locale/<lang>.json` */
	locale: string | null;
	change: Diff;
};

/** what's indexed as of a commit, carried over to its successor */
export type IndexState = {
	definitions: Map<string, Definition>;
	localizations: Map<string, Localization>;
	units: Map<string, Unit>;
};

/** trait file contents recorded in history, `locale` is `null` for definitions */
export type Stored = {
	kind: string;
	trait: string;
	locale: string | null;
	value: unknown;
};

/**
 * state as of a commit, from its tree and the trait files recorded in history as of it
 *
 * trait files lacking a well-formed record are tracked by blob alone
 */
export const restore = (
	entries: IndexForgeEntry[],
	stored: Stored[],
): IndexState => {
	const values = new Map(
		stored.map(({ kind, trait, locale, value }) => [
			JSON.stringify([kind, trait, locale]),
			value,
		]),
	);

	const known = new Map<string, Definition>();
	for (const [key, file] of definitions(entries)) {
		const value = values.get(JSON.stringify([file.kind, file.trait, null]));
		const l = typeof value === "undefined" ? null : layout(value);
		known.set(key, {
			...file,
			valid: isNone(l) ? null : { value, layout: l },
		});
	}

	const localized = new Map<string, Localization>();
	for (const [key, file] of localizations(entries)) {
		const value = values.get(key);
		localized.set(key, {
			...file,
			valid: typeof value === "undefined" ? null : { value },
		});
	}

	return {
		definitions: known,
		localizations: localized,
		units: expand(group(entries), known).units,
	};
};

/**
 * diffs a commit against the state as of its parent
 *
 * `missing` holds `<kind>/<trait>` of values skipped for lacking a definition
 */
export const advance = async (
	state: IndexState,
	commit: Pick<IndexForgeCommit, "hash" | "url">,
	entries: IndexForgeEntry[],
	forge: Pick<IndexForge, "blob">,
): Promise<{
	state: IndexState;
	traits: TraitChange[];
	changes: Change[];
	missing: Set<string>;
}> => {
	// `undefined` when malformed
	const json = async (hash: string): Promise<unknown> => {
		const text = (await forge.blob(hash)).toString("utf-8");
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	};

	const defined = await track(
		state.definitions,
		definitions(entries),
		async (file) => {
			const value = await json(file.hash);
			const l = typeof value === "undefined" ? null : layout(value);
			if (isNone(l)) {
				logger.warn(`malformed trait definition <${file.kind}/${file.trait}>`, {
					commit: commit.hash,
					kind: file.kind,
					trait: file.trait,
				});
				return null;
			}

			return { value, layout: l };
		},
	);

	const localized = await track(
		state.localizations,
		localizations(entries),
		async (file) => {
			const value = await json(file.hash);
			if (typeof value === "undefined") {
				logger.warn(
					`malformed trait localization <${file.kind}/${file.trait}/${file.locale}>`,
					{
						commit: commit.hash,
						kind: file.kind,
						trait: file.trait,
						locale: file.locale,
					},
				);
				return null;
			}

			return { value };
		},
	);

	const traits: TraitChange[] = [
		...defined.diffs.map(({ file, diff }) => ({
			kind: file.kind,
			trait: file.trait,
			locale: null,
			change: diff,
		})),
		...localized.diffs.map(({ file, diff }) => ({
			kind: file.kind,
			trait: file.trait,
			locale: file.locale,
			change: diff,
		})),
	];

	const { units, missing } = expand(group(entries), defined.tracked);

	// changes aren't sourced from trait files when the trait is a link or directory, or vanished
	const community: Source = { kind: "community", url: commit.url };

	const changes: Change[] = [];
	for (const key of new Set([...state.units.keys(), ...units.keys()])) {
		const before = state.units.get(key);
		const after = units.get(key);

		if (
			typeof before !== "undefined" &&
			typeof after !== "undefined" &&
			before.layout === after.layout &&
			before.entries.size === after.entries.size &&
			[...after.entries].every(([path, entry]) => {
				const other = before.entries.get(path);
				return other?.mode === entry.mode && other.hash === entry.hash;
			})
		) {
			continue;
		}

		if (typeof after === "undefined") {
			// biome-ignore lint/style/noNonNullAssertion: either side is present
			const { kind, id, trait, locale } = before!;
			changes.push({
				kind,
				id,
				trait,
				locale,
				change: { kind: "removed" },
				source: community,
			});
			continue;
		}

		const materialized = await readers[after.layout](after, {
			forge,
			community,
		});
		if (isNone(materialized)) {
			logger.warn(`malformed trait value <${after.path}>`, {
				commit: commit.hash,
				path: after.path,
				locale: after.locale,
				layout: after.layout,
			});
			continue;
		}

		changes.push({
			kind: after.kind,
			id: after.id,
			trait: after.trait,
			locale: after.locale,
			change: {
				kind: typeof before === "undefined" ? "added" : "modified",
				value: materialized.value,
			},
			source: materialized.source,
		});
	}

	return {
		state: {
			definitions: defined.tracked,
			localizations: localized.tracked,
			units,
		},
		traits,
		changes,
		missing,
	};
};

/** latest indexed commit, as read by {@link ServiceIndex.latest} */
const IndexLatestSealedSymbol = Symbol("IndexLatestSealedSymbol");

const IndexPulledSealedSymbol = Symbol("IndexPulledSealedSymbol");

type IndexHistory = Maybe<{ hash: string; sequence: number }>;

export type IndexLatest = Readonly<{
	[IndexLatestSealedSymbol]: IndexHistory;
}>;

type IndexPulledInner = Readonly<{
	/** latest indexed commit pulling departed from */
	latest: IndexHistory;
	head: string;
	/** last indexed commit still reachable from head */
	base: IndexHistory;
	/** history past `base` is no longer reachable from head */
	rewritten: boolean;
	/** oldest first */
	commits: {
		hash: string;
		createdAt: number;
		author: string | null;
		traits: TraitChange[];
		changes: Change[];
	}[];
}>;

/** unindexed state of the tracked branch, as fetched by {@link ServiceIndex.pull} */
export type IndexPulled = Readonly<{
	[IndexPulledSealedSymbol]: IndexPulledInner;
}>;

@Injectable()
export class ServiceIndex implements OnApplicationBootstrap {
	/** in-flight {@link request} */
	private syncing: Promise<void> | undefined;
	/** requested while syncing → sync once more */
	private pending = false;

	constructor(
		@Inject(DatabaseIndex) private readonly db: IDatabase<"index">,
		/** unconfigured → nothing to index */
		@Inject(IndexForge) private readonly forge: Maybe<IndexForge>,
	) {}

	async onApplicationBootstrap(): Promise<void> {
		if (!(await this.available())) {
			logger.warn("index not seeded, unavailable");
			return;
		}

		// commits pushed while down
		void this.request();
	}

	/** walking a repository from scratch takes too many requests, required a seeded index */
	async available(): Promise<boolean> {
		return isSome(await this.db.run(getHistoryLatest.bind.anonymous([])));
	}

	/** schedules {@link sync}, requests arriving while one is in flight collapse into a single follow-up */
	request(): Promise<void> {
		if (typeof this.syncing !== "undefined") {
			this.pending = true;
			return this.syncing;
		}

		this.syncing = (async () => {
			try {
				do {
					this.pending = false;
					try {
						await this.sync();
					} catch (error) {
						logger.error("error syncing index", { error });
					}
				} while (this.pending);
			} finally {
				this.syncing = undefined;
			}
		})();

		return this.syncing;
	}

	/**
	 * appends commits on the first-parent chain of the tracked branch to `history`, and rebuilds head from it
	 *
	 * history no longer reachable from the branch (force push) is discarded and walked anew
	 */
	async sync(): Promise<void> {
		while (true) {
			const pulled = await this.pull(await this.latest());
			if (isNone(pulled) || (await this.apply(pulled))) {
				return;
			}
		}
	}

	/** latest indexed commit, {@link apply} only proceeds while it remains the latest */
	async latest(): Promise<IndexLatest> {
		return {
			[IndexLatestSealedSymbol]: await this.db.run(
				getHistoryLatest.bind.anonymous([]),
			),
		};
	}

	/** fetches commits of the tracked branch not yet indexed past `latest`, `null` when there's nothing to apply */
	async pull(latest: IndexLatest): Promise<Maybe<IndexPulled>> {
		if (isNone(this.forge)) {
			return null;
		}
		const forge = memoize(this.forge);

		const head = await forge.head();

		const inner = latest[IndexLatestSealedSymbol];

		// unindexed commits from head down to the first indexed one, newest first
		const chain: IndexForgeCommit[] = [];
		// tree as of `base`
		let baseline: IndexForgeEntry[] = [];
		// checked upfront, as walking ancestry may involve requests
		let base: Maybe<{ hash: string; sequence: number }> = await this.db.run(
			getHistory.bind.named({ hash: head }),
		);
		if (isNone(base)) {
			for await (const commit of forge.ancestry(head)) {
				base = await this.db.run(getHistory.bind.named({ hash: commit.hash }));
				if (isSome(base)) {
					baseline = await forge.tree(commit.tree);
					break;
				}

				chain.push(commit);
			}
		}

		// anything indexed past `base` is no longer reachable from head
		const rewritten = isSome(inner) && inner.hash !== base?.hash;
		if (!rewritten && chain.length === 0) {
			return null;
		}

		if (rewritten) {
			logger.info(`history rewritten, discarding past <${base?.hash ?? "-"}>`, {
				head,
				base: base?.hash,
				latest: inner.hash,
			});
		}

		// definitions and localizations as of `base` are read from history rather than fetched
		const stored: Stored[] = [];
		if (isSome(base)) {
			for await (const row of this.db.run(
				getHistoryTraits.bind.named({ sequence: base.sequence }),
			)) {
				// `->` yields json text
				if (typeof row.value === "string") {
					stored.push({
						kind: row.entity_kind,
						trait: row.trait,
						locale: row.locale,
						value: JSON.parse(row.value),
					});
				}
			}
		}

		let state = restore(baseline, stored);

		// undefined traits, warned about once per pull
		const warned = new Set<string>();

		const commits: IndexPulledInner["commits"] = [];

		for (const commit of chain.toReversed()) {
			const step = await advance(
				state,
				commit,
				await forge.tree(commit.tree),
				forge,
			);

			for (const trait of step.missing) {
				if (!warned.has(trait)) {
					warned.add(trait);
					logger.warn(`values of undefined trait <${trait}> are skipped`, {
						commit: commit.hash,
						trait,
					});
				}
			}

			commits.push({
				hash: commit.hash,
				createdAt: commit.createdAt,
				author: isSome(commit.author) ? JSON.stringify(commit.author) : null,
				traits: step.traits,
				changes: step.changes,
			});

			state = step.state;
		}

		return {
			[IndexPulledSealedSymbol]: {
				latest: inner,
				head,
				base,
				rewritten,
				commits,
			},
		};
	}

	/**
	 * writes pulled commits to `history`, and materializes head from it
	 *
	 * `false` when history changed since pulling (e.g. another instance indexed in the meantime), nothing is written then
	 */
	async apply(pulled: IndexPulled): Promise<boolean> {
		const { latest, head, base, rewritten, commits } =
			pulled[IndexPulledSealedSymbol];

		const applied = await this.db.begin("w", async (t) => {
			const current = await t.run(getHistoryLatest.bind.anonymous([]));
			if (current?.hash !== latest?.hash) {
				return false;
			}

			// head is derived from history in its entirety
			// cleared upfront, as it references history about to be discarded
			await t.run(deleteHeadBrand.bind.anonymous([]));
			await t.run(deleteHeadCategory.bind.anonymous([]));
			await t.run(deleteHeadDevice.bind.anonymous([]));
			await t.run(deleteHeadTrait.bind.anonymous([]));

			if (rewritten) {
				await t.run(
					deleteHistorySucceeding.bind.named({
						sequence: base?.sequence ?? 0,
					}),
				);
			}

			let sequence = base?.sequence ?? 0;
			for (const commit of commits) {
				sequence += 1;

				await t.run(
					insertHistory.bind.named({
						hash: commit.hash,
						sequence,
						createdAt: commit.createdAt,
					}),
				);

				for (const trait of commit.traits) {
					await t.run(
						insertHistoryChangeTrait.bind.named({
							id: randomUUID(),
							historyHash: commit.hash,
							entityKind: trait.kind,
							trait: trait.trait,
							locale: trait.locale,
							change: JSON.stringify(trait.change),
							author: commit.author,
						}),
					);
				}

				for (const change of commit.changes) {
					await t.run(
						insertHistoryChangeEntity.bind.named({
							id: randomUUID(),
							historyHash: commit.hash,
							entityKind: change.kind,
							entityId: change.id,
							trait: change.trait,
							locale: change.locale,
							change: JSON.stringify(change.change),
							author: commit.author,
							source: JSON.stringify(change.source),
						}),
					);
				}
			}

			await t.run(insertHeadBrand.bind.anonymous([]));
			await t.run(insertHeadCategory.bind.anonymous([]));
			await t.run(insertHeadDevice.bind.anonymous([]));
			await t.run(insertHeadTrait.bind.anonymous([]));

			return true;
		});

		if (!applied) {
			logger.info(`history changed since pulling <${head}>, skipped`, {
				head,
				latest: latest?.hash,
			});
			return false;
		}

		logger.info(`indexed <${commits.length}> commits up to <${head}>`, {
			head,
			count: commits.length,
			rewritten,
		});
		return true;
	}
}
