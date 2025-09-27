/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { isRight } from "effect/Either";
import { Schema } from "effect/index";
import type { ParseError } from "effect/ParseResult";

import { schemas } from "./index";

const { positionals } = parseArgs({ strict: true, allowPositionals: true });

for (const positional of positionals) {
	const parsed = JSON.parse(await readFile(positional, "utf8"));

	let version: number | undefined;
	const errors: [version: number, error: ParseError][] = [];
	for (const [schemaVersion, schema] of schemas) {
		const validate = Schema.validateEither(schema as typeof Schema.Any);
		const validated = validate(parsed);
		if (isRight(validated)) {
			version = schemaVersion;
			continue;
		}

		errors.push([schemaVersion, validated.left]);
	}

	if (typeof version !== "undefined") {
		console.log(`✅ <${positional}> (v${version})`);
	} else {
		for (const [version, error] of errors) {
			console.warn(
				`❌ <${positional}> (v${version}) (length: ${error.message.length})`,
			);
			console.log(error.message);
		}
	}
}
