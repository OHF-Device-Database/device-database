import { glob } from "node:fs/promises";
import { join } from "node:path";
import { hrtime } from "node:process";
import { parseArgs } from "node:util";

import { formatNs } from "../../utility/format";
import { Database } from ".";
import { bake } from "./base";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

const modes = ["query", "explain", "bench"] as const;
type Mode = (typeof modes)[number];

const isMode = (arg: string): arg is Mode =>
	(modes as readonly string[]).includes(arg);

const {
	values: {
		query: queryName,
		parameters,
		mode,
		"database-name": databaseName,
		"database-location": databaseLocation,
		"query-directory": queryDirectory,
		"bench-runs": benchRuns,
		attach,
	},
} = parseArgs({
	options: {
		query: { type: "string" },
		parameters: { type: "string", short: "p" },
		mode: { type: "string", short: "m" },
		"bench-runs": { type: "string", short: "r" },
		"database-name": { type: "string" },
		"database-location": { type: "string" },
		"query-directory": { type: "string" },
		attach: { type: "string", multiple: true },
	},
});

if (typeof queryName === "undefined") {
	console.error("required parameter '--query' missing (name of query to run)");
	process.exit(1);
}

if (typeof databaseName === "undefined") {
	console.error(
		"required parameter '--database-name' missing (name of database)",
	);
	process.exit(1);
}

if (typeof databaseLocation === "undefined") {
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
	typeof queryDirectory === "undefined"
		? `${join(import.meta.dirname, "..", "..", "src", "service", "database", "query")}/*/*.ts`
		: `${queryDirectory}/*.ts`,
	{ withFileTypes: true },
)) {
	if (dirent.name === "index.ts") {
		continue;
	}

	type QueryBuilder = {
		name: string;
		bind: {
			named: (
				arg: unknown,
			) => BoundQuery<undefined, ResultMode, ConnectionMode, unknown>;
			anonymous: (
				arg: unknown,
			) => BoundQuery<undefined, ResultMode, ConnectionMode, unknown>;
		};
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

const db = new Database(
	undefined,
	bake({ location: databaseLocation }),
	Object.fromEntries(
		(attach ?? [])
			.entries()
			.map(([idx, location]) => [String(idx), bake({ location })]),
	),
);

const query = bound.query.substring(bound.query.indexOf("\n") + 1);

switch (mode) {
	case "explain": {
		console.log(db.explain(bound));
		break;
	}
	case "bench": {
		const runs = parsedBenchRuns ?? 5;
		const runLetters = String(runs).length;

		let overall: bigint = 0n;
		for (let run = 0; run < runs; run++) {
			const start = hrtime.bigint();
			db.raw.exec(query, {}, ...bound.parameters);
			const end = hrtime.bigint();

			const took = end - start;
			overall += took;

			console.log(
				`(${String(run + 1).padStart(runLetters, " ")}) ${formatNs(took)}s`,
			);
		}

		console.log(`average ${formatNs(overall / BigInt(runs))}s`);

		break;
	}
	case "query":
	case undefined: {
		let rows = 0;
		const start = hrtime.bigint();

		for (const row of db.raw.query(
			bound.query,
			{ returnArray: false },
			{},
			...bound.parameters,
		)) {
			console.log({ ...row });
			rows += 1;
		}

		const end = hrtime.bigint();

		console.log(`${rows} row(s) in ${formatNs(end - start)}s`);
		break;
	}
}
