/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { parseArgs } from "node:util";

import { IndexExternalDcl } from "../external/dcl/dcl.client";
import { ServiceIndexExternalDcl } from "../external/dcl/dcl.service";
import { paced } from "../paced";
import { seeding } from "./database";

const options = {
	// rest endpoint of a ledger node
	url: { type: "string", default: "https://on.dcl.csa-iot.org" },
	database: { type: "string" },
	// milliseconds between requests
	interval: { type: "string", default: "500" },
	"migration-directory": {
		type: "string",
		default: "src/service/database/migration/index",
	},
} as const;

const {
	values: {
		url,
		database,
		interval,
		"migration-directory": migrationDirectory,
	},
} = parseArgs({ options });

if (typeof database === "undefined") {
	console.error(
		"required parameter '--database' missing (location of index database, updated from its ledger height when present)",
	);
	process.exit(1);
}
if (!/^\d+$/.test(interval)) {
	console.error(`parameter '--interval' <${interval}> isn't milliseconds`);
	process.exit(1);
}

await seeding(database, migrationDirectory, async (db) => {
	const service = new ServiceIndexExternalDcl(
		db,
		new IndexExternalDcl(
			{ url },
			paced((input, init) => globalThis.fetch(input, init), {
				interval: Number(interval),
			}),
		),
	);

	await service.sync();
	// walking the ledger takes hours, catches up on entries changed meanwhile
	await service.sync();
});
