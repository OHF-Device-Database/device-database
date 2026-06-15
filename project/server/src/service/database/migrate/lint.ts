/** biome-ignore-all lint/suspicious/noConsole: is a tool */

import { parseArgs } from "node:util";

import { isSome } from "../../../type/maybe";
import { DatabaseMigrate, parseMigration } from ".";

const ALLOWED_PRAGMAS: ReadonlySet<string> = new Set(["foreign_keys"]);
const ALLOWED_PRAGMA_VALUES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	[["foreign_keys", new Set(["on", "off"])]],
);

const PRAGMA_PATTERN = /^\s*pragma\s+(\w+)\s*=\s*(.+?)\s*;?\s*$/i;

const options = {
	"migration-directory": {
		type: "string",
	},
} as const;

const {
	values: { "migration-directory": migrationDirectory },
} = parseArgs({ options });

if (typeof migrationDirectory === "undefined") {
	console.error(
		"required parameter '--migration-directory' missing (location of migration directory)",
	);
	process.exit(1);
}

type LintError = {
	offset: number | null;
	message: string;
};

type Pragma = { name: string; value: string; line: number };

const pragmas = (sql: string): Pragma[] => {
	const pragmas: Pragma[] = [];

	for (const [idx, line] of sql.split("\n").entries()) {
		const match = line.match(PRAGMA_PATTERN);
		if (isSome(match)) {
			pragmas.push({
				name: match[1].toLowerCase(),
				value: match[2].toLowerCase().replace(/['"]/g, ""),
				line: idx + 1,
			});
		}
	}

	return pragmas;
};

const lint = (content: string): LintError[] => {
	const errors: LintError[] = [];

	const result = parseMigration(content);

	if (result.kind === "error") {
		errors.push({
			offset: result.line,
			message: `${result.error}`,
		});
		return errors;
	}

	const { preflight, postflight } = result.migration;

	const preflightPragmas = pragmas(preflight ?? "");
	const postflightPragmas = pragmas(postflight ?? "");

	const allowed = (pragmas: readonly Pragma[]): LintError[] => {
		const errors: LintError[] = [];

		for (const pragma of pragmas) {
			if (!ALLOWED_PRAGMAS.has(pragma.name)) {
				errors.push({
					offset: pragma.line,
					message: `found disallowed pragma <${pragma.name}> (allowed: ${[...ALLOWED_PRAGMAS].join(", ")})`,
				});
			}
		}

		for (const pragma of pragmas) {
			const values = ALLOWED_PRAGMA_VALUES.get(pragma.name);
			if (typeof values === "undefined") {
				continue;
			}

			if (!values.has(pragma.value)) {
				errors.push({
					offset: pragma.line,
					message: `pragma <${pragma.name}> has disallowed value (allowed: ${[...values].join(", ")})`,
				});
			}
		}
		return errors;
	};

	for (const error of allowed(preflightPragmas)) {
		errors.push(error);
	}
	for (const error of allowed(postflightPragmas)) {
		errors.push(error);
	}

	const unmatched = (
		a: readonly Pragma[],
		b: readonly Pragma[],
	): LintError[] => {
		const errors: LintError[] = [];

		for (const pragma of a) {
			const matching = b.find((p) => p.name === pragma.name);

			if (typeof matching === "undefined") {
				if (ALLOWED_PRAGMAS.has(pragma.name)) {
					errors.push({
						offset: pragma.line,
						message: `pragma <${pragma.name}> not restored`,
					});
				}

				continue;
			}

			if (pragma.value === "off" && matching.value !== "on") {
				errors.push({
					offset: pragma.line,
					message: `encountered pragma <${pragma.name} = ${pragma.value}> that is not restore to <on>`,
				});
			}

			if (pragma.value === "on" && matching.value !== "off") {
				errors.push({
					offset: pragma.line,
					message: `encountered pragma <${pragma.name} = ${pragma.value}> that is not restore to <off>`,
				});
			}
		}

		return errors;
	};

	for (const error of unmatched(preflightPragmas, postflightPragmas)) {
		errors.push(error);
	}
	for (const error of unmatched(postflightPragmas, preflightPragmas)) {
		errors.push(error);
	}

	return errors;
};

// migration name → errors
const errors: Map<string, LintError[]> = new Map();
let errored = false;
for await (const migration of DatabaseMigrate.migrations(migrationDirectory)) {
	const result = lint(migration.content);
	if (result.length > 0) {
		errored = true;
	}

	errors.set(migration.name, result);
}

if (errored) {
	for (const [name, grouped] of errors) {
		for (const error of grouped) {
			const location = error.offset !== null ? `${name}:${error.offset}` : name;
			console.error(`[${location}]: ${error.message}`);
		}
	}
	process.exit(1);
}
