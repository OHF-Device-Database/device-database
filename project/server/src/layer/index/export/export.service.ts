import { createHash } from "node:crypto";
import { readdir, readFile, readlink } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import { Inject, Injectable } from "@nestjs/common";
import { Schema } from "effect";
import { isLeft } from "effect/Either";

import categorizedIntegrations from "../../../categorized-integrations.json" with {
	type: "json",
};
import { logger as parentLogger } from "../../../logger";
import {
	getExportBrands,
	getExportCategories,
	getExportDevices,
	getExportTraits,
} from "../../../service/database/query/index/export-get";
import { integrationCategories } from "../../../service/scheduler/scheduled/derive/device";
import { isSome } from "../../../type/maybe";
import { DatabaseIndex } from "../../database/database.module";

import type { IDatabase } from "../../../service/database";

const logger = parentLogger.child({ label: "index-export" });

/** file or symlink of the repository tree, path relative to its root */
export type IndexExportEntry = Readonly<
	{ path: string } & ({ content: string } | { target: string })
>;

export type IndexExportOptions = {
	/** partial tree of trait definitions, policies and categories, see {@link readIndexExportTree} */
	seed: readonly IndexExportEntry[];
	/** also export devices, seed traits and seed categories already present in the index */
	indexed?: boolean;
};

// identifiers of brands not in the index yet are uuid v5 of their name within this namespace, changing it changes them
const BRAND_NAMESPACE = Buffer.from("ceb12c4d3b6f4beeab7ba191ac3b4a91", "hex");

const ENTITY_KINDS = {
	brands: "brand",
	categories: "category",
	devices: "device",
} as const;

/** `ha_connectivity` → option, others are ambiguous (e.g. `network`: wi-fi / ethernet, `matter`: wi-fi / thread / ethernet), lack an option or don't describe the device (`cloud`: device may still connect locally) */
const HA_CONNECTIVITY = {
	zigbee: "zigbee",
	zwave: "zwave",
	bluetooth: "bluetooth",
	infrared: "infrared",
	knx: "knx",
	modbus: "modbus",
	dali: "dali",
	lorawan: "lorawan",
} as const;

/** integrations implying a single transport, with several (e.g. a hub bridging zigbee and z-wave) a device uses either */
const CONNECTIVITY = new Map(
	Object.entries(categorizedIntegrations).flatMap(([integration, manifest]) => {
		const connectivity =
			"ha_connectivity" in manifest ? manifest.ha_connectivity : null;
		const option =
			connectivity?.length === 1 &&
			Object.hasOwn(HA_CONNECTIVITY, connectivity[0])
				? HA_CONNECTIVITY[connectivity[0] as keyof typeof HA_CONNECTIVITY]
				: undefined;
		return typeof option === "undefined"
			? []
			: [[integration, option] as const];
	}),
);

const Entities = Schema.parseJson(
	Schema.Array(
		Schema.Struct({
			domain: Schema.String,
			original_device_class: Schema.NullOr(Schema.String),
		}),
	),
);

const shard = (kind: "brands" | "devices", id: string) =>
	`entities/${kind}/${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;

const valued = (
	path: string,
	value: unknown,
	source: { kind: "ha-telemetry" | "inferred" },
): IndexExportEntry => ({
	path: `${path}/value.json`,
	content: `${JSON.stringify({ value, source }, null, 2)}\n`,
});

/** derived device as read by the export */
export type IndexExportDevice = {
	id: string;
	integration: string;
	manufacturer: string;
	model: string | null;
	model_id: string | null;
	/** json array of `{ domain, original_device_class }` */
	entities: string;
	derived_device_id_canonical: string | null;
};

/** reads a tree from the filesystem, symlinks aren't followed */
export const readIndexExportTree = async (
	directory: string,
): Promise<IndexExportEntry[]> => {
	const entries: IndexExportEntry[] = [];
	for (const dirent of await readdir(directory, {
		recursive: true,
		withFileTypes: true,
	})) {
		const absolute = join(dirent.parentPath, dirent.name);
		const path = relative(directory, absolute).split(sep).join("/");
		if (dirent.isSymbolicLink()) {
			entries.push({ path, target: await readlink(absolute) });
		} else if (dirent.isFile()) {
			entries.push({ path, content: await readFile(absolute, "utf-8") });
		}
	}

	return entries.toSorted((a, b) => (a.path < b.path ? -1 : 1));
};

@Injectable()
export class ServiceIndexExport {
	constructor(@Inject(DatabaseIndex) private readonly db: IDatabase<"index">) {}

	/**
	 * entries of a device's traits
	 *
	 * @param brands lower-cased name → id, brands not present are registered and their `name` emitted alongside
	 * @param categories category id → directory
	 */
	static deriveDeviceTraits(
		device: IndexExportDevice,
		{
			brands,
			categories,
		}: {
			brands: Map<string, string>;
			categories: ReadonlyMap<string, string>;
		},
	): IndexExportEntry[] {
		const entries: IndexExportEntry[] = [];

		const root = shard("devices", device.id);
		const link = (path: string, target: string) =>
			entries.push({
				path: `${root}/${path}`,
				target: posix.relative(posix.dirname(`${root}/${path}`), target),
			});

		{
			const parts = [device.model, device.model_id].filter(
				(part): part is string => isSome(part) && part !== "",
			);
			// model names often carry the model id already
			const name =
				parts.length === 2 &&
				parts[0].toLowerCase().includes(parts[1].toLowerCase())
					? parts[0]
					: parts.join(" ");
			if (name !== "") {
				entries.push(valued(`${root}/name`, name, { kind: "ha-telemetry" }));
			}
		}

		{
			const key = device.manufacturer.trim().toLowerCase();
			let id = brands.get(key);
			if (typeof id === "undefined") {
				const hash = createHash("sha1")
					.update(BRAND_NAMESPACE)
					.update(key)
					.digest();
				hash[6] = (hash[6] & 0x0f) | 0x50;
				hash[8] = (hash[8] & 0x3f) | 0x80;
				const hex = hash.toString("hex");
				id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

				brands.set(key, id);
				entries.push(
					valued(`${shard("brands", id)}/name`, device.manufacturer.trim(), {
						kind: "ha-telemetry",
					}),
				);
			}

			link("brand", shard("brands", id));
		}

		if (isSome(device.derived_device_id_canonical)) {
			link(
				"duplicate-of",
				shard("devices", device.derived_device_id_canonical),
			);
		}

		// by integration, as derived devices are categorized
		{
			const categorized = (integrationCategories.get(device.integration) ?? [])
				.map(({ id }) => categories.get(id))
				.filter((category) => typeof category !== "undefined");
			for (const [idx, directory] of categorized.entries()) {
				link(`categories/ordered/${idx + 1}`, directory);
			}
		}

		const decoded = Schema.decodeUnknownEither(Entities)(device.entities);
		if (isLeft(decoded)) {
			logger.warn(`malformed entities of device <${device.id}>`, {
				device: device.id,
			});
			return entries;
		}

		const entities = decoded.right;
		const classes = new Set(
			entities.map(
				(entity) => `${entity.domain}/${entity.original_device_class}`,
			),
		);

		// partial, other sources aren't reported
		if (classes.has("sensor/battery")) {
			entries.push(
				valued(`${root}/power-source`, ["battery"], { kind: "inferred" }),
			);
		}

		if (entities.some((entity) => entity.domain === "update")) {
			entries.push(valued(`${root}/firmware-ota`, true, { kind: "inferred" }));
		}

		const connectivity = CONNECTIVITY.get(device.integration);
		if (typeof connectivity !== "undefined") {
			entries.push(
				valued(`${root}/connectivity`, [connectivity], { kind: "inferred" }),
			);
		}

		return entries;
	}

	/** maps derived devices onto the repository tree, along with seed traits and categories not in the index yet */
	async export({
		seed,
		indexed = false,
	}: IndexExportOptions): Promise<IndexExportEntry[]> {
		const entries: IndexExportEntry[] = [];

		// policies aren't indexed → only those linked by exported traits are, to not overwrite present ones
		{
			const defined = new Set<string>();
			if (!indexed) {
				for await (const row of this.db.run(getExportTraits.bind.named({}))) {
					defined.add(`${row.entity_kind}/${row.trait}`);
				}
			}

			const policies = new Set<string>();
			const traits = seed.filter((entry) => {
				const [root, kind, trait] = entry.path.split("/");
				if (
					root !== "traits" ||
					defined.has(
						`${Object.hasOwn(ENTITY_KINDS, kind) ? ENTITY_KINDS[kind as keyof typeof ENTITY_KINDS] : kind}/${trait}`,
					)
				) {
					return false;
				}

				if ("target" in entry && posix.basename(entry.path) === "policy.json") {
					policies.add(posix.join(posix.dirname(entry.path), entry.target));
				}
				return true;
			});

			entries.push(
				...seed.filter((entry) => policies.has(entry.path)),
				...traits,
			);
		}

		// category id → directory, devices link to seed categories whether indexed or not
		const categories = new Map<string, string>();
		{
			const indexedCategories = new Set<string>();
			if (!indexed) {
				for await (const row of this.db.run(
					getExportCategories.bind.named({}),
				)) {
					indexedCategories.add(row.name);
				}
			}

			for (const entry of seed) {
				const segments = entry.path.split("/");
				if (
					segments[0] !== "entities" ||
					segments[1] !== "categories" ||
					segments.length < 4
				) {
					continue;
				}

				// nested categories alternate between name and `categories` segments
				let end = 2;
				while (
					segments[end + 1] === "categories" &&
					end + 2 < segments.length
				) {
					end += 2;
				}

				// ids of categories.json are unique across the tree
				categories.set(segments[end], segments.slice(0, end + 1).join("/"));

				const name = segments
					.slice(2, end + 1)
					.filter((_, idx) => idx % 2 === 0)
					.join("/");
				if (!indexedCategories.has(name)) {
					entries.push(entry);
				}
			}
		}

		// lower-cased name → id, a brand is only exported when not indexed yet
		const brands = new Map<string, string>();
		for await (const row of this.db.run(getExportBrands.bind.named({}))) {
			if (typeof row.name === "string") {
				const key = row.name.trim().toLowerCase();
				if (!brands.has(key)) {
					brands.set(key, row.id);
				}
			}
		}

		let count = 0;
		for await (const device of this.db.run(
			getExportDevices.bind.named({ indexed: indexed ? 1 : 0 }),
		)) {
			count++;
			entries.push(
				...ServiceIndexExport.deriveDeviceTraits(device, {
					brands,
					categories,
				}),
			);
		}

		logger.debug(`exported <${count}> devices`, { count, indexed });

		return entries;
	}
}
