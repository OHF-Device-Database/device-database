import { join, posix } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";

import { logger } from "../../../logger";
import { testDatabase } from "../../../service/database/utility";
import { integrationCategories } from "../../../service/scheduler/scheduled/derive/device";
import {
	type IndexExportDevice,
	type IndexExportEntry,
	readIndexExportTree,
	ServiceIndexExport,
} from "./export.service";

import type { IDatabase } from "../../../service/database";

logger.silent = true;

const brand = "41423942-68d6-4498-866b-79ea0e174db9";
const alias = "522f6647-40a2-475c-ba32-8c3dd554c0f5";

const devices = {
	indexed: "aaaa0000-0000-4000-8000-000000000000",
	bulb: "bbbb0000-0000-4000-8000-000000000000",
	plug: "cccc0000-0000-4000-8000-000000000000",
	cover: "dddd0000-0000-4000-8000-000000000000",
	malformed: "eeee0000-0000-4000-8000-000000000000",
};

const seed: IndexExportEntry[] = [
	{ path: "policies/default/definition.json", content: "default" },
	{ path: "policies/strict/definition.json", content: "strict" },
	{ path: "traits/devices/name/definition.json", content: "name" },
	{
		path: "traits/devices/name/policy.json",
		target: "../../../policies/default/definition.json",
	},
	{ path: "traits/devices/overview/definition.json", content: "overview" },
	{
		path: "traits/devices/overview/policy.json",
		target: "../../../policies/strict/definition.json",
	},
	...[
		"lighting",
		"lighting/categories/bulb",
		"networking",
		"networking/categories/router",
		"monitoring/categories/device-tracker",
	].map((category) => ({
		path: `entities/categories/${category}/name/en/value.json`,
		content: category,
	})),
];

const value = (value: unknown, kind = "ha-telemetry") =>
	`${JSON.stringify({ value, source: { kind } }, null, 2)}\n`;

const entities = (...entities: [string, string | null][]) =>
	JSON.stringify(
		entities.map(([domain, original_device_class]) => ({
			domain,
			original_device_class,
		})),
	);

const populate = (db: IDatabase<"index">) => {
	db.raw.exec(`
		insert into history (hash, sequence, created_at) values ('h', 0, 0);
		insert into head_brand (id, trait, locale, value, history_hash) values
			('${brand}', 'name', null, '"Acme"', 'h'),
			('${alias}', 'name', null, '"ACME"', 'h'),
			('${alias}', 'alias-of', null, '"${brand}"', 'h');
		insert into head_device (id, trait, locale, value, history_hash) values
			('${devices.indexed}', 'name', null, '"Indexed"', 'h');
		insert into head_trait (entity_kind, trait, locale, value, history_hash) values
			('device', 'name', null, '{}', 'h');
		insert into head_category (name, parent, trait, locale, value, history_hash) values
			('networking', null, 'name', 'en', '"Networking"', 'h');
	`);

	// attached read-only
	const location = db.raw.location("derived");
	if (typeof location !== "string") {
		throw new Error("derived not attached");
	}
	using derived = new DatabaseSync(location);
	const insert = derived.prepare(
		"insert into derived_device (id, integration, manufacturer, model, model_id, entities, count, derived_device_id_canonical) values (?, ?, ?, ?, ?, ?, 1, ?)",
	);
	insert.run(devices.indexed, "hue", "Acme", "Indexed", null, "[]", null);
	insert.run(
		devices.bulb,
		"zha",
		"acme ",
		"Bulb",
		"X1",
		entities(
			["light", null],
			["sensor", "temperature"],
			["sensor", "carbon_dioxide"],
			["sensor", "battery"],
			["binary_sensor", "carbon_monoxide"],
			["update", "firmware"],
		),
		null,
	);
	insert.run(
		devices.plug,
		"lifx",
		"Globex",
		"Plug X1",
		"x1",
		entities(
			["cover", "blind"],
			["cover", "shutter"],
			["sensor", "power"],
			["sensor", "energy"],
		),
		devices.bulb,
	);
	insert.run(
		devices.cover,
		"zwave_js",
		"Globex",
		null,
		"G2",
		entities(["cover", "awning"]),
		null,
	);
	insert.run(
		devices.malformed,
		"vodafone_station",
		"Globex",
		"E1",
		null,
		"nope",
		null,
	);
};

const flatten = (entries: IndexExportEntry[]) =>
	Object.fromEntries(
		entries.map((entry) => [
			entry.path,
			"target" in entry ? `-> ${entry.target}` : entry.content,
		]),
	);

test("index export", async (t: TestContext) => {
	await t.test("exports devices not indexed yet", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		populate(db);

		const entries = await new ServiceIndexExport(db).export({ seed });

		const brands = entries
			.map(
				(entry) =>
					/^entities\/brands\/(..)\/(..)\/([^/]+)\/name\/value\.json$/.exec(
						entry.path,
					)?.[3],
			)
			.filter((id) => typeof id !== "undefined");
		t.assert.strictEqual(brands.length, 1);
		const [globex] = brands;
		t.assert.match(
			globex,
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);

		const shard = (id: string) => `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
		const bulb = `entities/devices/${shard(devices.bulb)}`;
		const plug = `entities/devices/${shard(devices.plug)}`;
		const cover = `entities/devices/${shard(devices.cover)}`;
		const malformed = `entities/devices/${shard(devices.malformed)}`;

		t.assert.deepStrictEqual(flatten(entries), {
			"policies/strict/definition.json": "strict",
			"traits/devices/overview/definition.json": "overview",
			"traits/devices/overview/policy.json":
				"-> ../../../policies/strict/definition.json",

			// networking is indexed
			"entities/categories/lighting/name/en/value.json": "lighting",
			"entities/categories/lighting/categories/bulb/name/en/value.json":
				"lighting/categories/bulb",
			"entities/categories/networking/categories/router/name/en/value.json":
				"networking/categories/router",
			"entities/categories/monitoring/categories/device-tracker/name/en/value.json":
				"monitoring/categories/device-tracker",

			[`${bulb}/name/value.json`]: value("Bulb X1"),
			[`${bulb}/brand`]: `-> ../../../../brands/${shard(brand)}`,
			[`${bulb}/power-source/value.json`]: value(["battery"], "inferred"),
			[`${bulb}/firmware-ota/value.json`]: value(true, "inferred"),
			[`${bulb}/connectivity/value.json`]: value(["zigbee"], "inferred"),

			[`${plug}/name/value.json`]: value("Plug X1"),
			[`entities/brands/${shard(globex)}/name/value.json`]: value("Globex"),
			[`${plug}/brand`]: `-> ../../../../brands/${shard(globex)}`,
			[`${plug}/duplicate-of`]: `-> ../../../${shard(devices.bulb)}`,
			[`${plug}/categories/ordered/1`]:
				"-> ../../../../../../categories/lighting/categories/bulb",

			[`${cover}/name/value.json`]: value("G2"),
			[`${cover}/brand`]: `-> ../../../../brands/${shard(globex)}`,
			[`${cover}/connectivity/value.json`]: value(["zwave"], "inferred"),

			[`${malformed}/name/value.json`]: value("E1"),
			[`${malformed}/brand`]: `-> ../../../../brands/${shard(globex)}`,
			[`${malformed}/categories/ordered/1`]:
				"-> ../../../../../../categories/networking/categories/router",
			[`${malformed}/categories/ordered/2`]:
				"-> ../../../../../../categories/monitoring/categories/device-tracker",
		});

		// links resolve within the tree
		const paths = new Set(entries.map((entry) => entry.path));
		for (const entry of entries) {
			if ("target" in entry) {
				const resolved = posix.join(posix.dirname(entry.path), entry.target);
				t.assert.match(resolved, /^(entities|policies)\//);
				if (resolved.startsWith("entities/categories/")) {
					t.assert.ok(
						[...paths].some((path) => path.startsWith(`${resolved}/`)),
						resolved,
					);
				}
			}
		}
	});

	await t.test("exports indexed when asked to", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		populate(db);

		const paths = (
			await new ServiceIndexExport(db).export({ seed, indexed: true })
		).map((entry) => entry.path);

		for (const entry of seed) {
			t.assert.ok(paths.includes(entry.path), entry.path);
		}
		t.assert.ok(
			paths.includes(
				`entities/devices/aa/aa/${devices.indexed}/name/value.json`,
			),
		);
	});
});

test("index export seed", async (t: TestContext) => {
	const entries = await readIndexExportTree(join(import.meta.dirname, "seed"));
	const files = new Map(
		entries.flatMap((entry) =>
			"content" in entry ? [[entry.path, entry.content] as const] : [],
		),
	);

	const traits = new Set(
		entries
			.filter((entry) => entry.path.startsWith("traits/"))
			.map((entry) => entry.path.split("/").slice(0, 3).join("/")),
	);
	t.assert.ok(traits.size > 0);

	for (const trait of traits) {
		const definition = JSON.parse(files.get(`${trait}/definition.json`) ?? "");
		t.assert.strictEqual(definition.id, trait.split("/")[2], trait);

		const locale = JSON.parse(files.get(`${trait}/locale/en.json`) ?? "");
		t.assert.strictEqual(typeof locale.label, "string", trait);
		for (const option of definition.options ?? []) {
			t.assert.strictEqual(
				typeof locale.options?.[option.id]?.title,
				"string",
				`${trait} ${option.id}`,
			);
		}

		const policy = entries.find(
			(entry) => entry.path === `${trait}/policy.json`,
		);
		t.assert.ok(typeof policy !== "undefined" && "target" in policy, trait);
		t.assert.ok(
			files.has(posix.join(trait, policy.target)),
			`${trait} ${policy.target}`,
		);
	}

	// categories devices are linked to by integration
	for (const categories of integrationCategories.values()) {
		for (const { id } of categories) {
			const named = [...files].find(([path]) =>
				path.endsWith(`/${id}/name/en/value.json`),
			);
			t.assert.ok(typeof named !== "undefined", id);
			t.assert.strictEqual(typeof JSON.parse(named[1]).value, "string", id);
		}
	}
});

test("index export device traits", async (t: TestContext) => {
	const root = `entities/devices/bb/bb/${devices.bulb}`;
	const device = (
		overrides: Partial<IndexExportDevice> = {},
	): IndexExportDevice => ({
		id: devices.bulb,
		integration: "unknown",
		manufacturer: "Acme",
		model: null,
		model_id: null,
		entities: "[]",
		derived_device_id_canonical: null,
		...overrides,
	});
	const derive = (
		overrides: Partial<IndexExportDevice> = {},
		categories: ReadonlyMap<string, string> = new Map(),
	) =>
		flatten(
			ServiceIndexExport.deriveDeviceTraits(device(overrides), {
				brands: new Map([["acme", brand]]),
				categories,
			}),
		);
	const branded = { [`${root}/brand`]: `-> ../../../../brands/41/42/${brand}` };

	await t.test("name", (t: TestContext) => {
		for (const [model, model_id, expected] of [
			["Bulb", "X1", "Bulb X1"],
			// model carries model id already
			["Bulb X1", "x1", "Bulb X1"],
			["Bulb", null, "Bulb"],
			[null, "X1", "X1"],
			["", "X1", "X1"],
			[null, null, undefined],
			["", "", undefined],
		] as const) {
			t.assert.strictEqual(
				derive({ model, model_id })[`${root}/name/value.json`],
				typeof expected === "undefined" ? undefined : value(expected),
				`${model} ${model_id}`,
			);
		}
	});

	await t.test("brand", (t: TestContext) => {
		t.assert.deepStrictEqual(derive({ manufacturer: " ACME " }), branded);

		// unknown brands are registered, their name only emitted once
		const brands = new Map<string, string>();
		const first = flatten(
			ServiceIndexExport.deriveDeviceTraits(
				device({ manufacturer: "Globex " }),
				{ brands, categories: new Map() },
			),
		);
		const globex = brands.get("globex");
		t.assert.ok(typeof globex === "string");
		t.assert.match(
			globex,
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		const shard = `${globex.slice(0, 2)}/${globex.slice(2, 4)}/${globex}`;
		t.assert.deepStrictEqual(first, {
			[`entities/brands/${shard}/name/value.json`]: value("Globex"),
			[`${root}/brand`]: `-> ../../../../brands/${shard}`,
		});

		t.assert.deepStrictEqual(
			flatten(
				ServiceIndexExport.deriveDeviceTraits(
					device({ manufacturer: "GLOBEX" }),
					{ brands, categories: new Map() },
				),
			),
			{ [`${root}/brand`]: `-> ../../../../brands/${shard}` },
		);

		// stable across runs
		const again = new Map<string, string>();
		ServiceIndexExport.deriveDeviceTraits(device({ manufacturer: "globex" }), {
			brands: again,
			categories: new Map(),
		});
		t.assert.strictEqual(again.get("globex"), globex);
	});

	await t.test("duplicate-of", (t: TestContext) => {
		t.assert.strictEqual(
			derive({ derived_device_id_canonical: devices.plug })[
				`${root}/duplicate-of`
			],
			`-> ../../../cc/cc/${devices.plug}`,
		);
	});

	await t.test("categories", (t: TestContext) => {
		const [integration, categorized] =
			[...integrationCategories].find(
				([, categories]) => categories.length > 1,
			) ?? [];
		t.assert.ok(
			typeof integration === "string" && typeof categorized !== "undefined",
		);

		// categories without directory are skipped, numbering stays contiguous
		const [, ...present] = categorized;
		const derived = derive(
			{ integration },
			new Map(
				present.map(({ id }) => [
					id,
					`entities/categories/parent/categories/${id}`,
				]),
			),
		);
		t.assert.deepStrictEqual(
			Object.entries(derived).filter(([path]) =>
				path.startsWith(`${root}/categories/`),
			),
			present.map(({ id }, idx) => [
				`${root}/categories/ordered/${idx + 1}`,
				`-> ../../../../../../categories/parent/categories/${id}`,
			]),
		);
	});

	await t.test("inferred", (t: TestContext) => {
		t.assert.deepStrictEqual(
			derive({
				integration: "deconz",
				entities: entities(["sensor", "battery"], ["update", null]),
			}),
			{
				...branded,
				[`${root}/power-source/value.json`]: value(["battery"], "inferred"),
				[`${root}/firmware-ota/value.json`]: value(true, "inferred"),
				[`${root}/connectivity/value.json`]: value(["zigbee"], "inferred"),
			},
		);

		// transport is ambiguous
		t.assert.deepStrictEqual(derive({ integration: "matter" }), branded);
		t.assert.deepStrictEqual(derive({ integration: "homee" }), branded);

		t.assert.strictEqual(
			derive({ integration: "zerproc" })[`${root}/connectivity/value.json`],
			value(["bluetooth"], "inferred"),
		);
	});

	await t.test("malformed entities", (t: TestContext) => {
		t.assert.deepStrictEqual(
			derive({ model: "Bulb", integration: "zha", entities: "nope" }),
			{ [`${root}/name/value.json`]: value("Bulb"), ...branded },
		);
	});
});
