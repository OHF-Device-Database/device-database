import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cwd } from "node:process";
import { parseArgs } from "node:util";

import openapiTS, { astToString } from "openapi-typescript";

const options = {
	spec: {
		type: "string",
	},
	out: {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options });

if (typeof values.spec === "undefined") {
	console.error(
		"required parameter '--spec' missing (location of bundled OpenAPI specification)",
	);
	process.exit(1);
}
if (typeof values.out === "undefined") {
	console.error(
		"required parameter '--out' missing (destination for generated schema)",
	);
	process.exit(1);
}

const { spec, out } = values;

const ast = await openapiTS(new URL(`file://${join(cwd(), spec)}`));
const contents = astToString(ast);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, contents);
