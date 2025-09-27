/** biome-ignore-all lint/suspicious/noConsole: is a tool */
import { parseArgs } from "node:util";

import { JSONSchema } from "effect/index";

import { schemas } from ".";

const options = {
	version: {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options, strict: true, allowPositionals: true });

if (typeof values.version === "undefined") {
	console.error(
		"required parameter '--version' missing (version of schema to output)",
	);
	process.exit(1);
}

const wanted = parseInt(values.version, 10);

outer: {
	for (const [version, schema] of schemas) {
		if (version === wanted) {
			const jsonSchema = JSONSchema.make(schema);
			console.log(JSON.stringify(jsonSchema, null, 2));
			break outer;
		}
	}

	console.error(`no schema with version <${wanted}>`);
	process.exit(1);
}
