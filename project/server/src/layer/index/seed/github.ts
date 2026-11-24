/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { env } from "node:process";
import { parseArgs } from "node:util";

import { IndexForgeGithub } from "../forge/github/github.service";
import { ServiceIndex } from "../index.service";
import { paced } from "../paced";
import { seeding } from "./database";

const options = {
	owner: { type: "string" },
	repository: { type: "string" },
	branch: { type: "string", default: "main" },
	database: { type: "string" },
	// milliseconds between requests
	interval: { type: "string", default: "1000" },
	"migration-directory": {
		type: "string",
		default: "src/service/database/migration/index",
	},
} as const;

const {
	values: {
		owner,
		repository,
		branch,
		database,
		interval,
		"migration-directory": migrationDirectory,
	},
} = parseArgs({ options });

if (typeof owner === "undefined") {
	console.error("required parameter '--owner' missing (repository owner)");
	process.exit(1);
}
if (typeof repository === "undefined") {
	console.error("required parameter '--repository' missing (repository name)");
	process.exit(1);
}
if (typeof database === "undefined") {
	console.error(
		"required parameter '--database' missing (location of index database, resumed from when present)",
	);
	process.exit(1);
}
if (!/^\d+$/.test(interval)) {
	console.error(`parameter '--interval' <${interval}> isn't milliseconds`);
	process.exit(1);
}

await seeding(database, migrationDirectory, async (db) => {
	await new ServiceIndex(
		db,
		new IndexForgeGithub(
			{
				owner,
				repository,
				branch,
				token: env.INDEX_GITHUB_TOKEN ?? null,
				callback: { secret: "" },
			},
			paced((input, init) => globalThis.fetch(input, init), {
				interval: Number(interval),
			}),
		),
	).sync();
});
