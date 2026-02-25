import { glob } from "node:fs/promises";
import { join } from "node:path";
import { hrtime } from "node:process";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { parseArgs } from "node:util";

import { formatNs } from "../../src/utility/format.ts";

const modes = ["query", "explain", "bench"] as const;
type Mode = (typeof modes)[number];

const isMode = (arg: string): arg is Mode =>
	(modes as readonly string[]).includes(arg);

const {
	values: {
		query: queryName,
		parameters,
		mode,
		"database-path": databasePath,
		"bench-runs": benchRuns,
	},
} = parseArgs({
	options: {
		query: { type: "string" },
		parameters: { type: "string", short: "p" },
		mode: { type: "string", short: "m" },
		"bench-runs": { type: "string", short: "r" },
		"database-path": { type: "string" },
	},
});

if (typeof queryName === "undefined") {
	console.error("required parameter '--query' missing (voucher to inspect)");
	process.exit(1);
}

if (typeof databasePath === "undefined") {
	console.error(
		"required parameter '--database-path' missing (path of database)",
	);
	process.exit(1);
}

let parsedBenchRuns;
if (typeof benchRuns !== "undefined") {
	const parsed = parseInt(benchRuns, 10);
	if (Number.isNaN(parsed)) {
		console.error(
			`invalid amount of bench runs <${benchRuns}> (should be whole number)`,
		);

		process.exit(1);
	}

	parsedBenchRuns = parsed;
}

if (typeof mode !== "undefined") {
	if (!isMode(mode)) {
		console.error(`invalid mode <${mode}> (supported: ${modes.join(", ")})`);
		process.exit(1);
	}
}

let parsedParameters;
if (typeof parameters !== "undefined") {
	try {
		parsedParameters = JSON.parse(parameters);
	} catch {
		console.error(
			"malformed parameter '--parameters' (either object with parameter names as keys, or array)",
		);
		process.exit(1);
	}
}

const wanted = queryName.toLowerCase();

let bound;
for await (const dirent of glob(
	`${join(import.meta.dirname, "..", "..", "src", "service", "database", "query")}/*.ts`,
	{ withFileTypes: true },
)) {
	if (dirent.name === "index.ts") {
		continue;
	}

	type QueryBuilder = {
		name: string;
		bind: {
			named: (arg: unknown) => Bound;
			anonymous: (arg: unknown) => Bound;
		};
	};

	type Bound = {
		query: string;
		parameters: SQLInputValue[];
	};

	const queries = await import(join(dirent.parentPath, dirent.name));
	for (const builder of Object.values(queries)) {
		const cast = builder as QueryBuilder;
		if (cast.name.toLowerCase() === wanted) {
			bound =
				typeof parsedParameters === "undefined"
					? cast.bind.anonymous([])
					: Array.isArray(parsedParameters)
						? cast.bind.anonymous(parsedParameters)
						: cast.bind.named(parsedParameters);
		}
	}
}

if (typeof bound === "undefined") {
	console.error(`query <${queryName}> not found`);
	process.exit(1);
}

const db = new DatabaseSync(databasePath);

const query = bound.query.substring(bound.query.indexOf("\n") + 1);

switch (mode) {
	case "explain": {
		const prepared = db.prepare(`explain query plan ${query}`);
		for (const row of prepared.iterate(...bound.parameters)) {
			// biome-ignore-start lint/suspicious/noExplicitAny: `parent` can be used to infer indentation
			console.log(
				`|${"--".repeat((row as any).parent)} ${(row as any).detail}`,
			);
			// biome-ignore-end lint/suspicious/noExplicitAny: ↑
		}
		break;
	}
	case "bench": {
		const runs = parsedBenchRuns ?? 5;
		const runLetters = String(runs).length;

		const prepared = db.prepare(query);

		let overall: bigint = 0n;
		for (let run = 0; run < runs; run++) {
			const start = hrtime.bigint();
			const all = prepared.all(...bound.parameters);
			const end = hrtime.bigint();

			const took = end - start;
			overall += took;

			console.log(
				`(${String(run + 1).padStart(runLetters, " ")}) ${all.length} row(s) in ${formatNs(took)}s`,
			);
		}

		console.log(`average ${formatNs(overall / BigInt(runs))}s`);

		break;
	}
	case "query":
	case undefined: {
		let rows = 0;
		const start = hrtime.bigint();
		const prepared = db.prepare(query);
		for (const row of prepared.iterate(...bound.parameters)) {
			console.log({ ...row });
			rows += 1;
		}

		const end = hrtime.bigint();

		console.log(`${rows} row(s) in ${formatNs(end - start)}s`);
		break;
	}
}
