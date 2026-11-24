import { createHash } from "node:crypto";
import { type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { testDatabase } from "../../service/database/utility";
import { advance, restore, ServiceIndex } from "./index.service";

import type { IDatabase } from "../../service/database";
import type {
	IndexForge,
	IndexForgeCommit,
	IndexForgeEntry,
} from "./forge/base";

logger.silent = true;

const hash = (content: string) =>
	createHash("sha1").update(content).digest("hex");

type File = { content: string; symlink?: true };
type Commit = {
	hash: string;
	parent?: string;
	files: Record<string, File>;
};

const tree = (files: Record<string, File>): IndexForgeEntry[] =>
	Object.entries(files).map(([path, file]) => ({
		path,
		mode: file.symlink ? "120000" : "100644",
		hash: hash(file.content),
	}));

/** in-memory forge, a commit's tree shares its hash, blobs are addressed by content hash */
class FakeForge implements IndexForge {
	readonly commits = new Map<string, Commit>();
	tip = "";
	readonly calls: string[] = [];

	commit(commit: Commit) {
		this.commits.set(commit.hash, commit);
		this.tip = commit.hash;
	}

	async head(): Promise<string> {
		this.calls.push("head");
		return this.tip;
	}

	async *ancestry(id: string): AsyncIterable<IndexForgeCommit> {
		this.calls.push(`ancestry ${id}`);

		let commit = this.commits.get(id);
		while (typeof commit !== "undefined") {
			yield {
				hash: commit.hash,
				tree: commit.hash,
				createdAt: 0,
				url: `commit/${commit.hash}`,
				author: { kind: "github", id: 1 },
			};
			commit = this.commits.get(commit.parent ?? "");
		}
	}

	async tree(id: string): Promise<IndexForgeEntry[]> {
		this.calls.push(`tree ${id}`);

		const commit = this.commits.get(id);
		if (typeof commit === "undefined") {
			throw new Error(`unknown tree <${id}>`);
		}

		return tree(commit.files);
	}

	async blob(id: string): Promise<Buffer> {
		for (const commit of this.commits.values()) {
			for (const file of Object.values(commit.files)) {
				if (hash(file.content) === id) {
					return Buffer.from(file.content);
				}
			}
		}

		throw new Error(`unknown blob <${id}>`);
	}
}

const brand = "41423942-68d6-4498-866b-79ea0e174db9";
const alias = "522f6647-40a2-475c-ba32-8c3dd554c0f5";
const device = "45d6718c-bb96-4a86-b646-94418980cb88";

const value = (value: unknown, source: unknown = { kind: "inferred" }) => ({
	content: JSON.stringify({ value, source }),
});

const definition = (definition: Record<string, unknown>) => ({
	content: JSON.stringify(definition),
});

const text = definition({ type: "text" });
const link = (resource: string, multiple: boolean) =>
	definition({ type: "picker", resource, pattern: { multiple } });

/** trait definitions of the initial commit */
const definitions: Record<string, File> = {
	"traits/brands/name/definition.json": text,
	"traits/brands/alias-of/definition.json": link("brand", false),
	"traits/categories/name/definition.json": text,
	"traits/categories/highlights/definition.json": link("trait", true),
	"traits/devices/name/definition.json": text,
	"traits/devices/overview/definition.json": definition({
		type: "text",
		localized: true,
	}),
	"traits/devices/brand/definition.json": link("brand", false),
	"traits/devices/categories/definition.json": link("category", true),
	"traits/devices/images/definition.json": definition({ type: "photos" }),
	"traits/devices/fitting/definition.json": text,
	"traits/devices/malformed/definition.json": text,
};

/** trait files of the initial commit, symlinks resolve relative to their directory */
const initial: Record<string, File> = {
	"README.md": { content: "readme" },
	...definitions,
	[`entities/brands/41/42/${brand}/name/value.json`]: value("Acme", {
		kind: "database",
		value: "csa",
	}),
	[`entities/brands/52/2f/${alias}/name/value.json`]: value("ACME"),
	[`entities/brands/52/2f/${alias}/alias-of`]: {
		content: `../../../41/42/${brand}`,
		symlink: true,
	},
	"entities/categories/lighting/highlights/ordered/1": {
		content: "../../../../../traits/devices/fitting",
		symlink: true,
	},
	"entities/categories/climate-control/categories/fan/name/value.json":
		value("Fan"),
	[`entities/devices/45/d6/${device}/name/value.json`]: value("Cooler"),
	[`entities/devices/45/d6/${device}/overview/en/value.json`]: value("Cools"),
	[`entities/devices/45/d6/${device}/overview/de/value.json`]: value("Kühlt"),
	[`entities/devices/45/d6/${device}/brand`]: {
		content: `../../../../brands/41/42/${brand}`,
		symlink: true,
	},
	[`entities/devices/45/d6/${device}/categories/ordered/1`]: {
		content: "../../../../../../categories/climate-control/categories/fan",
		symlink: true,
	},
	[`entities/devices/45/d6/${device}/categories/ordered/2`]: {
		content: "../../../../../../categories/lighting",
		symlink: true,
	},
	[`entities/devices/45/d6/${device}/images/ordered/1`]: {
		content: "../originals/cover.png",
		symlink: true,
	},
	[`entities/devices/45/d6/${device}/images/originals/cover.png`]: {
		content: "png",
	},
	// trait values are expected to be well-formed json
	[`entities/devices/45/d6/${device}/malformed/value.json`]: { content: "{" },
	// values of traits lacking a definition are skipped
	[`entities/devices/45/d6/${device}/undefined/value.json`]: value("x"),
};

const rows = (db: IDatabase<"index">, sql: string) =>
	[...db.raw.query(sql, { returnArray: false }, {})].map((row) => ({
		...row,
	}));

test("index", async (t: TestContext) => {
	await t.test("walks history into head", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const forge = new FakeForge();
		const service = new ServiceIndex(db, forge);

		forge.commit({ hash: "a", files: initial });
		await service.sync();

		t.assert.deepStrictEqual(
			rows(db, "select id, trait, value from head_brand order by 1, 2"),
			[
				{ id: brand, trait: "name", value: '"Acme"' },
				{ id: alias, trait: "alias-of", value: `"${brand}"` },
				{ id: alias, trait: "name", value: '"ACME"' },
			].toSorted((a, b) =>
				`${a.id}${a.trait}`.localeCompare(`${b.id}${b.trait}`),
			),
		);

		t.assert.deepStrictEqual(
			rows(
				db,
				"select name, parent, trait, value from head_category order by 1",
			),
			[
				{
					name: "climate-control/fan",
					parent: "climate-control",
					trait: "name",
					value: '"Fan"',
				},
				{
					name: "lighting",
					parent: null,
					trait: "highlights",
					value: '["devices/fitting"]',
				},
			],
		);

		t.assert.deepStrictEqual(
			rows(db, "select trait, locale, value from head_device order by 1, 2"),
			[
				{ trait: "brand", locale: null, value: `"${brand}"` },
				{
					trait: "categories",
					locale: null,
					value: '["climate-control/fan","lighting"]',
				},
				{
					trait: "images",
					locale: null,
					value: JSON.stringify({
						ordered: ["originals/cover.png"],
						originals: { "cover.png": hash("png") },
					}),
				},
				{ trait: "name", locale: null, value: '"Cooler"' },
				{ trait: "overview", locale: "de", value: '"Kühlt"' },
				{ trait: "overview", locale: "en", value: '"Cools"' },
			],
		);

		t.assert.deepStrictEqual(
			rows(
				db,
				"select entity_kind || '/' || trait trait, history_hash from head_trait where locale is null order by 1",
			),
			Object.keys(definitions)
				.map((path) => {
					const [, entity, trait] = path.split("/");
					const kind = (
						{
							brands: "brand",
							categories: "category",
							devices: "device",
						} as Record<string, string>
					)[entity];
					return { trait: `${kind}/${trait}`, history_hash: "a" };
				})
				.toSorted((a, b) => (a.trait < b.trait ? -1 : 1)),
		);

		// change that last set a trait is reachable through its commit
		t.assert.deepStrictEqual(
			rows(
				db,
				`select hb.history_hash, hc.author, hc.source from head_brand hb join history_change_entity hc on (hc.history_hash = hb.history_hash and hc.entity_kind = 'brand' and hc.entity_id = hb.id and hc.trait = hb.trait and hc.locale is hb.locale) where hb.id = '${brand}'`,
			),
			[
				{
					history_hash: "a",
					author: '{"kind":"github","id":1}',
					source: '{"kind":"database","value":"csa"}',
				},
			],
		);

		forge.commit({
			hash: "b",
			parent: "a",
			files: {
				...Object.fromEntries(
					Object.entries(initial).filter(
						([path]) => !path.endsWith("alias-of"),
					),
				),
				[`entities/devices/45/d6/${device}/name/value.json`]: value("Cooler 2"),
				[`entities/devices/45/d6/${device}/overview/de/value.json`]:
					value("Kühlt gut"),
			},
		});
		await service.sync();

		t.assert.deepStrictEqual(
			rows(
				db,
				"select history_hash, entity_id, trait, locale, change ->> '$.kind' kind, author, source from history_change_entity where history_hash = 'b' order by trait",
			),
			[
				{
					history_hash: "b",
					entity_id: alias,
					trait: "alias-of",
					locale: null,
					kind: "removed",
					author: '{"kind":"github","id":1}',
					source: '{"kind":"community","url":"commit/b"}',
				},
				{
					history_hash: "b",
					entity_id: device,
					trait: "name",
					locale: null,
					kind: "modified",
					author: '{"kind":"github","id":1}',
					source: '{"kind":"inferred"}',
				},
				{
					history_hash: "b",
					entity_id: device,
					trait: "overview",
					locale: "de",
					kind: "modified",
					author: '{"kind":"github","id":1}',
					source: '{"kind":"inferred"}',
				},
			],
		);
		t.assert.deepStrictEqual(
			rows(db, `select trait from head_brand where id = '${alias}'`),
			[{ trait: "name" }],
		);
		t.assert.deepStrictEqual(
			rows(db, "select value from head_device where trait = 'name'"),
			[{ value: '"Cooler 2"' }],
		);

		t.assert.deepStrictEqual(
			rows(
				db,
				"select trait, locale, history_hash from head_device where trait in ('brand', 'name', 'overview') order by 1, 2",
			),
			[
				{ trait: "brand", locale: null, history_hash: "a" },
				{ trait: "name", locale: null, history_hash: "b" },
				{ trait: "overview", locale: "de", history_hash: "b" },
				{ trait: "overview", locale: "en", history_hash: "a" },
			],
		);

		// walk stops at `a`, whose tree serves as baseline
		t.assert.deepStrictEqual(forge.calls.slice(-4), [
			"head",
			"ancestry b",
			"tree a",
			"tree b",
		]);

		// head already indexed → ancestry isn't walked
		forge.calls.length = 0;
		await service.sync();
		t.assert.deepStrictEqual(forge.calls, ["head"]);
	});

	await t.test(
		"rebuilds history rewritten by force push",
		async (t: TestContext) => {
			await using db = await testDatabase("index", {
				derived: true,
				index: true,
			});
			const forge = new FakeForge();
			const service = new ServiceIndex(db, forge);

			forge.commit({ hash: "a", files: initial });
			forge.commit({
				hash: "b",
				parent: "a",
				files: {
					...initial,
					[`entities/devices/45/d6/${device}/name/value.json`]: value("B"),
				},
			});
			await service.sync();

			// `b` is dropped, `c` takes its place
			forge.commit({
				hash: "c",
				parent: "a",
				files: {
					...initial,
					[`entities/brands/41/42/${brand}/name/value.json`]: value("C"),
				},
			});
			await service.sync();

			t.assert.deepStrictEqual(
				rows(db, "select hash, sequence from history order by sequence"),
				[
					{ hash: "a", sequence: 1 },
					{ hash: "c", sequence: 2 },
				],
			);
			t.assert.deepStrictEqual(
				rows(db, "select value from head_device where trait = 'name'"),
				[{ value: '"Cooler"' }],
			);
			t.assert.deepStrictEqual(
				rows(
					db,
					`select value from head_brand where id = '${brand}' and trait = 'name'`,
				),
				[{ value: '"C"' }],
			);

			// history rewritten from root
			forge.commits.clear();
			forge.commit({
				hash: "x",
				files: {
					...definitions,
					[`entities/brands/41/42/${brand}/name/value.json`]: value("X"),
				},
			});
			await service.sync();

			t.assert.deepStrictEqual(rows(db, "select hash, sequence from history"), [
				{ hash: "x", sequence: 1 },
			]);
			t.assert.deepStrictEqual(
				rows(db, "select count(*) count from head_device"),
				[{ count: 0 }],
			);
			t.assert.deepStrictEqual(rows(db, "select id, value from head_brand"), [
				{ id: brand, value: '"X"' },
			]);

			// force push onto an indexed ancestor → history is only truncated
			forge.commit({
				hash: "y",
				parent: "x",
				files: {
					...definitions,
					[`entities/brands/41/42/${brand}/name/value.json`]: value("Y"),
				},
			});
			await service.sync();
			forge.tip = "x";
			forge.calls.length = 0;
			await service.sync();

			t.assert.deepStrictEqual(forge.calls, ["head"]);
			t.assert.deepStrictEqual(rows(db, "select hash, sequence from history"), [
				{ hash: "x", sequence: 1 },
			]);
			t.assert.deepStrictEqual(rows(db, "select id, value from head_brand"), [
				{ id: brand, value: '"X"' },
			]);
		},
	);

	await t.test(
		"reads values according to trait definitions",
		async (t: TestContext) => {
			await using db = await testDatabase("index", {
				derived: true,
				index: true,
			});
			const forge = new FakeForge();
			const service = new ServiceIndex(db, forge);

			const values = {
				[`entities/devices/45/d6/${device}/overview/value.json`]:
					value("Plain"),
				[`entities/devices/45/d6/${device}/overview/en/value.json`]:
					value("Cools"),
			};
			const overview = (sql: string) =>
				rows(db, `${sql} where trait = 'overview' order by 1, 2`);

			forge.commit({
				hash: "a",
				files: {
					"traits/devices/overview/definition.json": text,
					...values,
				},
			});
			await service.sync();

			t.assert.deepStrictEqual(
				overview("select locale, value from head_device"),
				[{ locale: null, value: '"Plain"' }],
			);

			// definition alone changes, baseline definitions are read from history
			forge.commit({
				hash: "b",
				parent: "a",
				files: {
					"traits/devices/overview/definition.json": definition({
						type: "text",
						localized: true,
					}),
					...values,
				},
			});
			await service.sync();

			t.assert.deepStrictEqual(
				overview("select locale, value from head_device"),
				[{ locale: "en", value: '"Cools"' }],
			);
			t.assert.deepStrictEqual(
				rows(
					db,
					"select history_hash, change ->> '$.kind' kind, change ->> '$.value.localized' localized from history_change_trait order by 1",
				),
				[
					{ history_hash: "a", kind: "added", localized: null },
					{ history_hash: "b", kind: "modified", localized: 1 },
				],
			);
			t.assert.deepStrictEqual(
				overview(
					"select locale, change ->> '$.kind' kind from history_change_entity",
				),
				[
					{ locale: null, kind: "added" },
					{ locale: null, kind: "removed" },
					{ locale: "en", kind: "added" },
				],
			);

			// malformed definition retains the last well-formed one
			forge.commit({
				hash: "c",
				parent: "b",
				files: {
					"traits/devices/overview/definition.json": { content: "{" },
					...values,
				},
			});
			await service.sync();

			t.assert.deepStrictEqual(
				overview("select locale, value from head_device"),
				[{ locale: "en", value: '"Cools"' }],
			);

			// values of removed definitions vanish
			forge.commit({ hash: "d", parent: "c", files: values });
			await service.sync();

			t.assert.deepStrictEqual(
				overview("select locale, value from head_device"),
				[],
			);
			t.assert.deepStrictEqual(
				rows(db, "select count(*) count from head_trait"),
				[{ count: 0 }],
			);
			t.assert.deepStrictEqual(
				rows(
					db,
					"select change ->> '$.kind' kind from history_change_trait where history_hash = 'd'",
				),
				[{ kind: "removed" }],
			);
		},
	);

	await t.test("stores trait localizations", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const forge = new FakeForge();
		const service = new ServiceIndex(db, forge);

		const strings = (label: string) => ({
			content: JSON.stringify({ label }),
		});
		const head = () =>
			rows(
				db,
				"select locale, value ->> '$.label' label, history_hash from head_trait where locale is not null order by 1",
			);
		const history = (hash: string) =>
			rows(
				db,
				`select locale, change ->> '$.kind' kind from history_change_trait where history_hash = '${hash}' order by 1`,
			);

		forge.commit({
			hash: "a",
			files: {
				"traits/devices/name/definition.json": text,
				"traits/devices/name/locale/en.json": strings("Name"),
				"traits/devices/name/locale/de.json": strings("Name"),
			},
		});
		await service.sync();

		t.assert.deepStrictEqual(head(), [
			{ locale: "de", label: "Name", history_hash: "a" },
			{ locale: "en", label: "Name", history_hash: "a" },
		]);
		t.assert.deepStrictEqual(history("a"), [
			{ locale: null, kind: "added" },
			{ locale: "de", kind: "added" },
			{ locale: "en", kind: "added" },
		]);

		// baseline localizations are compared by blob, definition is left as is
		forge.commit({
			hash: "b",
			parent: "a",
			files: {
				"traits/devices/name/definition.json": text,
				"traits/devices/name/locale/en.json": strings("Title"),
				"traits/devices/name/locale/de.json": strings("Name"),
			},
		});
		await service.sync();

		t.assert.deepStrictEqual(head(), [
			{ locale: "de", label: "Name", history_hash: "a" },
			{ locale: "en", label: "Title", history_hash: "b" },
		]);
		t.assert.deepStrictEqual(history("b"), [
			{ locale: "en", kind: "modified" },
		]);

		// malformed localization retains the last well-formed one
		forge.commit({
			hash: "c",
			parent: "b",
			files: {
				"traits/devices/name/definition.json": text,
				"traits/devices/name/locale/en.json": { content: "{" },
			},
		});
		await service.sync();

		t.assert.deepStrictEqual(head(), [
			{ locale: "en", label: "Title", history_hash: "b" },
		]);
		t.assert.deepStrictEqual(history("c"), [{ locale: "de", kind: "removed" }]);
		// localizations don't affect the definition
		t.assert.deepStrictEqual(
			rows(db, "select history_hash from head_trait where locale is null"),
			[{ history_hash: "a" }],
		);

		// localization malformed from the start, restored from history across syncs
		forge.commit({
			hash: "d",
			parent: "c",
			files: {
				"traits/devices/name/definition.json": text,
				"traits/devices/name/locale/en.json": { content: "{" },
				"traits/devices/name/locale/fr.json": { content: "{" },
			},
		});
		await service.sync();
		forge.commit({
			hash: "e",
			parent: "d",
			files: {
				"traits/devices/name/definition.json": text,
				"traits/devices/name/locale/en.json": strings("Name"),
				"traits/devices/name/locale/fr.json": strings("Nom"),
			},
		});
		await service.sync();

		t.assert.deepStrictEqual(history("d"), []);
		t.assert.deepStrictEqual(history("e"), [
			{ locale: "en", kind: "modified" },
			{ locale: "fr", kind: "added" },
		]);
	});

	await t.test("advances state per commit", async (t: TestContext) => {
		const forge = (...sets: Record<string, File>[]) => ({
			blob: async (id: string) => {
				const file = sets
					.flatMap((files) => Object.values(files))
					.find((file) => hash(file.content) === id);
				if (typeof file === "undefined") {
					throw new Error(`unknown blob <${id}>`);
				}

				return Buffer.from(file.content);
			},
		});
		const summary = (step: Awaited<ReturnType<typeof advance>>) => ({
			traits: step.traits
				.map(({ trait, locale, change }) => `${trait}/${locale} ${change.kind}`)
				.toSorted(),
			changes: step.changes
				.map(({ trait, locale, change, source }) => ({
					trait,
					locale,
					change,
					source,
				}))
				.toSorted((a, b) => (a.trait < b.trait ? -1 : 1)),
			missing: [...step.missing],
		});

		const root = `entities/devices/45/d6/${device}`;
		const a: Record<string, File> = {
			"traits/devices/name/definition.json": text,
			"traits/devices/name/locale/en.json": { content: '{"label":"Name"}' },
			"traits/devices/categories/definition.json": link("category", true),
			[`${root}/name/value.json`]: value("Cooler"),
			[`${root}/categories/ordered/1`]: {
				content: "../../../../../../categories/lighting",
				symlink: true,
			},
			[`${root}/undefined/value.json`]: value("x"),
		};
		const first = await advance(
			restore([], []),
			{ hash: "a", url: "commit/a" },
			tree(a),
			forge(a),
		);

		t.assert.deepStrictEqual(summary(first), {
			traits: ["categories/null added", "name/en added", "name/null added"],
			changes: [
				{
					trait: "categories",
					locale: null,
					change: { kind: "added", value: ["lighting"] },
					source: { kind: "community", url: "commit/a" },
				},
				{
					trait: "name",
					locale: null,
					change: { kind: "added", value: "Cooler" },
					source: { kind: "inferred" },
				},
			],
			missing: ["device/undefined"],
		});

		// malformed trait files retain their last well-formed contents
		const b: Record<string, File> = {
			"traits/devices/name/definition.json": { content: "{" },
			"traits/devices/name/locale/en.json": { content: "{" },
			"traits/devices/categories/definition.json": link("category", true),
			[`${root}/name/value.json`]: value("Chiller"),
		};
		const second = await advance(
			first.state,
			{ hash: "b", url: "commit/b" },
			tree(b),
			forge(a, b),
		);

		t.assert.deepStrictEqual(summary(second), {
			traits: [],
			changes: [
				{
					trait: "categories",
					locale: null,
					change: { kind: "removed" },
					source: { kind: "community", url: "commit/b" },
				},
				{
					trait: "name",
					locale: null,
					change: { kind: "modified", value: "Chiller" },
					source: { kind: "inferred" },
				},
			],
			missing: [],
		});

		// values vanish along with their definition
		const c: Record<string, File> = {
			[`${root}/name/value.json`]: value("Chiller"),
		};
		const third = await advance(
			second.state,
			{ hash: "c", url: "commit/c" },
			tree(c),
			forge(c),
		);

		t.assert.deepStrictEqual(summary(third), {
			traits: [
				"categories/null removed",
				"name/en removed",
				"name/null removed",
			],
			changes: [
				{
					trait: "name",
					locale: null,
					change: { kind: "removed" },
					source: { kind: "community", url: "commit/c" },
				},
			],
			missing: ["device/name"],
		});
	});

	await t.test("restores state from history", async (t: TestContext) => {
		const root = `entities/devices/45/d6/${device}`;
		const overview = definition({ type: "text", localized: true });
		const files: Record<string, File> = {
			"traits/devices/name/definition.json": text,
			"traits/devices/name/locale/en.json": { content: "{" },
			"traits/devices/overview/definition.json": overview,
			"traits/devices/brand/definition.json": { content: "{" },
			[`${root}/name/value.json`]: value("Cooler"),
			[`${root}/overview/en/value.json`]: value("Cools"),
			[`${root}/overview/de/value.json`]: value("Kühlt"),
			[`${root}/brand`]: {
				content: `../../../../brands/41/42/${brand}`,
				symlink: true,
			},
		};

		const state = restore(tree(files), [
			{ kind: "device", trait: "name", locale: null, value: { type: "text" } },
			// malformed in the tree, retains what history recorded last
			{ kind: "device", trait: "name", locale: "en", value: { label: "Name" } },
			{
				kind: "device",
				trait: "overview",
				locale: null,
				value: JSON.parse(overview.content),
			},
			// absent from the tree
			{
				kind: "device",
				trait: "fitting",
				locale: null,
				value: { type: "text" },
			},
		]);

		t.assert.deepStrictEqual(
			[...state.definitions.values()].map(({ trait, hash: blob, valid }) => ({
				trait,
				blob,
				layout: valid?.layout ?? null,
			})),
			[
				{ trait: "name", blob: hash(text.content), layout: "value" },
				{ trait: "overview", blob: hash(overview.content), layout: "values" },
				// never recorded → tracked by blob alone
				{ trait: "brand", blob: hash("{"), layout: null },
			],
		);
		t.assert.deepStrictEqual(
			[...state.localizations.values()].map(
				({ trait, locale, hash: blob, valid }) => ({
					trait,
					locale,
					blob,
					valid,
				}),
			),
			[
				{
					trait: "name",
					locale: "en",
					blob: hash("{"),
					valid: { value: { label: "Name" } },
				},
			],
		);
		// units follow the restored layouts, values of undefined traits are omitted
		t.assert.deepStrictEqual(
			[...state.units.keys()].map((key) => JSON.parse(key)),
			[
				["device", device, "name", null],
				["device", device, "overview", "en"],
				["device", device, "overview", "de"],
			],
		);

		// the unchanged tree yields nothing, without fetching a single blob
		const step = await advance(
			state,
			{ hash: "b", url: "commit/b" },
			tree(files),
			{ blob: () => Promise.reject(new Error("unexpected blob")) },
		);
		t.assert.deepStrictEqual(
			{ traits: step.traits, changes: step.changes },
			{ traits: [], changes: [] },
		);
	});

	await t.test("is available once seeded", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const forge = new FakeForge();
		const service = new ServiceIndex(db, forge);

		t.assert.strictEqual(await service.available(), false);

		forge.commit({ hash: "a", files: initial });
		await service.sync();

		t.assert.strictEqual(await service.available(), true);
	});

	await t.test("skips stale pulls", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const forge = new FakeForge();
		const service = new ServiceIndex(db, forge);

		forge.commit({ hash: "a", files: initial });
		const pulled = await service.pull(await service.latest());
		t.assert.ok(pulled !== null);

		// history advances in the meantime
		await service.sync();

		t.assert.strictEqual(await service.apply(pulled), false);
		t.assert.deepStrictEqual(rows(db, "select hash from history"), [
			{ hash: "a" },
		]);
	});

	await t.test("skips without forge", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const service = new ServiceIndex(db, null);

		t.assert.strictEqual(await service.pull(await service.latest()), null);
		await service.sync();
		t.assert.deepStrictEqual(rows(db, "select count(*) count from history"), [
			{ count: 0 },
		]);
	});
});
