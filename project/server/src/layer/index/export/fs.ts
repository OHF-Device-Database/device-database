/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import { Database } from "../../../service/database";
import { bake } from "../../../service/database/base";
import { DatabaseMigrate } from "../../../service/database/migrate";
import { unroll } from "../../../utility/iterable";
import { readIndexExportTree, ServiceIndexExport } from "./export.service";

import type { IndexExportEntry } from "./export.service";

const options = {
	derived: { type: "string" },
	index: { type: "string" },
	output: { type: "string" },
	"include-indexed": { type: "boolean", default: false },
	"seed-directory": {
		type: "string",
		default: "src/layer/index/export/seed",
	},
	"migration-directory": {
		type: "string",
		default: "src/service/database/migration/index",
	},
} as const;

const {
	values: {
		derived,
		index,
		output,
		"include-indexed": indexed,
		"seed-directory": seedDirectory,
		"migration-directory": migrationDirectory,
	},
} = parseArgs({ options });

if (typeof derived === "undefined") {
	console.error(
		"required parameter '--derived' missing (location of derived database)",
	);
	process.exit(1);
}
if (typeof output === "undefined") {
	console.error(
		"required parameter '--output' missing (directory the tree is written to)",
	);
	process.exit(1);
}

let entries: IndexExportEntry[];

const temporary = await mkdtemp(
	join(tmpdir(), "device-database-index-export-"),
);
try {
	// without an index, nothing counts as indexed
	const db = new Database(
		"index",
		bake({
			location: index ?? join(temporary, "index.db"),
			readOnly: typeof index !== "undefined",
		}),
		{ derived: bake({ location: derived, readOnly: true }) },
	);

	if (typeof index === "undefined") {
		const migrate = new DatabaseMigrate(db);
		const plan = migrate.plan(
			await unroll(DatabaseMigrate.migrations(migrationDirectory)),
		);
		if (!DatabaseMigrate.viable(plan)) {
			console.error("migration plan not viable");
			console.error(plan);
			process.exit(1);
		}
		migrate.act(plan);
	}

	await db.spawn();
	try {
		entries = await new ServiceIndexExport(db).export({
			seed: await readIndexExportTree(seedDirectory),
			indexed,
		});
	} finally {
		await db.despawn();
		db.raw.close();
	}
} finally {
	await rm(temporary, { recursive: true, force: true });
}

for (const entry of entries) {
	const path = join(output, entry.path);
	await mkdir(dirname(path), { recursive: true });
	if ("target" in entry) {
		await rm(path, { force: true });
		await symlink(entry.target, path);
	} else {
		await writeFile(path, entry.content);
	}
}

console.log(`exported <${entries.length}> entries into <${output}>`);
