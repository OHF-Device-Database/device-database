import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { Analyzer } from "./analyze.ts";
import { emit } from "./emit.ts";
import { parseSource } from "./source.ts";

export { AnalyzeError, Analyzer, valueTypeOf } from "./analyze.ts";
export { DEFAULT_TYPES_IMPORT, EmitError, emit } from "./emit.ts";
export { LexError, lex } from "./lex.ts";
export { parseSource, SourceError } from "./source.ts";

export type {
	AnalyzedColumn,
	AnalyzedQuery,
	ValueType,
} from "./analyze.ts";
export type { EmitOptions } from "./emit.ts";
export type { Token, TokenKind } from "./lex.ts";
export type {
	Command,
	SourceColumnAnnotation,
	SourceParameter,
	SourceQuery,
} from "./source.ts";

export type GenerateOptions = {
	/**
	 * database that queries are prepared against
	 * provided by the consumer, so that it is set up exactly like at runtime
	 * (schema applied, other databases attached, custom functions registered)
	 *
	 * an authorizer is installed temporarily while preparing queries, replacing any existing one
	 */
	db: DatabaseSync;
	/** database name, used as literal type discriminator on `Query` / `BoundQuery` */
	database: string;
	/**
	 * module specifier that `Query` and `BoundQuery` are imported from, relative to the generated file
	 * @default "sql-codegen/types"
	 */
	typesImport?: string | undefined;
};

/** generates a module of query builders from the contents of a single `.sql` file */
export const generate = (
	source: string,
	options: GenerateOptions & { path?: string },
): string => {
	const analyzer = new Analyzer(options.db);
	const queries = parseSource(source, options.path).map((query) =>
		analyzer.analyze(query),
	);

	return emit(queries, {
		database: options.database,
		typesImport: options.typesImport,
		sourceName:
			typeof options.path === "undefined" ? undefined : basename(options.path),
	});
};

export type GeneratedFile = {
	source: string;
	output: string;
};

/** generates module of query builders for each `.sql` file in `directory` */
export const generateDirectory = (
	options: GenerateOptions & { directory: string; outDirectory?: string },
): GeneratedFile[] => {
	const generated: GeneratedFile[] = [];

	const entries = readdirSync(options.directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
		.map((entry) => entry.name)
		.sort();

	for (const name of entries) {
		const source = join(options.directory, name);
		const output = join(
			options.outDirectory ?? options.directory,
			`${name.slice(0, -".sql".length)}.ts`,
		);

		const contents = generate(readFileSync(source, "utf8"), {
			...options,
			path: source,
		});
		writeFileSync(output, contents);
		generated.push({ source, output });
	}

	return generated;
};
