import { isTrivia, LexError, lex } from "./lex.ts";

import type { Token } from "./lex.ts";

export const COMMANDS = [":one", ":many", ":exec"] as const;
export type Command = (typeof COMMANDS)[number];

export type SourceParameter = {
	/** name without sigil, e.g. `id` for `@id` */
	name: string;
	/** 1-based index used in the rewritten statement (`?<index>`) */
	index: number;
};

/**
 * explicitly typed output column (`-- column: <name> <declared type> [not null]`)
 * for columns sqlite can't attribute a declared type to (e.g. expressions)
 */
export type SourceColumnAnnotation = {
	name: string;
	/** interpreted like the declared type of a table column */
	declared: string;
	notNull: boolean;
	line: number;
};

export type SourceQuery = {
	name: string;
	command: Command;
	/** statement as written, used for documentation */
	original: string;
	/** statement with named parameters rewritten to numbered parameters (`?<index>`) */
	statement: string;
	/** ordered by index */
	parameters: SourceParameter[];
	columns: SourceColumnAnnotation[];
	/** comments preceding the statement (including column annotations) */
	comments: string[];
	/** 1-based line of the `-- name:` annotation */
	line: number;
};

export class SourceError extends Error {
	readonly path: string | undefined;
	readonly line: number;

	constructor(message: string, line: number, path?: string) {
		super(`${path ?? "<source>"}:${line}: ${message}`);
		this.name = "SourceError";
		this.path = path;
		this.line = line;
	}
}

const ANNOTATION = /^--\s*name:\s*(?<name>\S+)\s+(?<command>:\S+)\s*$/;
const ANNOTATION_COLUMN =
	/^--\s*column:\s*(?:"(?<quoted>(?:[^"]|"")+)"|(?<name>\S+))\s+(?<declared>.*?)\s*$/;
const NOT_NULL = /\s*\bnot\s+null$/i;

const lineOf = (source: string, offset: number): number => {
	let line = 1;
	for (let i = 0; i < offset; i++) {
		if (source[i] === "\n") {
			line++;
		}
	}
	return line;
};

const isCommand = (command: string): command is Command =>
	(COMMANDS as readonly string[]).includes(command);

/**
 * splits a file into queries, each preceded by a sqlc-style annotation (`-- name: <Name> <:command>`)
 * and terminated by a semicolon (or end of file)
 */
export const parseSource = (source: string, path?: string): SourceQuery[] => {
	let tokens: Token[];
	try {
		tokens = lex(source);
	} catch (e) {
		if (e instanceof LexError) {
			throw new SourceError(e.message, lineOf(source, e.offset), path);
		}
		throw e;
	}

	const queries: SourceQuery[] = [];

	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i] as Token;

		const annotation =
			token.kind === "comment-line" ? ANNOTATION.exec(token.text) : null;
		if (annotation === null) {
			if (!isTrivia(token)) {
				throw new SourceError(
					`statement without preceding annotation (expected "-- name: <Name> <${COMMANDS.join(" | ")}>")`,
					lineOf(source, token.start),
					path,
				);
			}
			i++;
			continue;
		}

		const line = lineOf(source, token.start);
		const { name, command } = annotation.groups as {
			name: string;
			command: string;
		};
		if (!isCommand(command)) {
			throw new SourceError(
				`unexpected command <${command}> (allowed: ${COMMANDS.map((c) => `"${c}"`).join(", ")})`,
				line,
				path,
			);
		}

		i++;
		const body: Token[] = [];
		while (i < tokens.length) {
			const t = tokens[i] as Token;
			i++;
			if (t.kind === "semicolon") {
				break;
			}
			body.push(t);
		}

		// leading and trailing trivia is not part of the statement
		// (a trailing line comment would otherwise swallow anything appended to the statement)
		const first = body.findIndex((t) => !isTrivia(t));
		const last = body.findLastIndex((t) => !isTrivia(t));
		if (first === -1) {
			throw new SourceError(`query <${name}> is empty`, line, path);
		}
		const statementTokens = body.slice(first, last + 1);

		const columns: SourceColumnAnnotation[] = [];
		const comments: string[] = [];
		for (const t of body.slice(0, first)) {
			if (t.kind === "whitespace") {
				continue;
			}
			comments.push(t.text);

			const column =
				t.kind === "comment-line" ? ANNOTATION_COLUMN.exec(t.text) : null;
			if (column === null) {
				continue;
			}

			const groups = column.groups as {
				quoted: string | undefined;
				name: string | undefined;
				declared: string;
			};
			const notNull = NOT_NULL.test(groups.declared);
			const declared = groups.declared.replace(NOT_NULL, "");
			const columnLine = lineOf(source, t.start);
			if (declared === "") {
				throw new SourceError(
					`column annotation without type (expected "-- column: <name> <type> [not null]")`,
					columnLine,
					path,
				);
			}
			columns.push({
				name: groups.quoted?.replaceAll('""', '"') ?? (groups.name as string),
				declared,
				notNull,
				line: columnLine,
			});
		}

		const parameters = new Map<string, SourceParameter>();
		let statement = "";
		for (const t of statementTokens) {
			if (t.kind === "parameter-positional") {
				throw new SourceError(
					`query <${name}> uses positional parameter <${t.text}>, which can't be named, use a named parameter instead (e.g. "@id")`,
					lineOf(source, t.start),
					path,
				);
			}

			if (t.kind === "parameter-named") {
				const parameterName = t.text.slice(1);
				let parameter = parameters.get(parameterName);
				if (typeof parameter === "undefined") {
					parameter = { name: parameterName, index: parameters.size + 1 };
					parameters.set(parameterName, parameter);
				}
				statement += `?${parameter.index}`;
				continue;
			}

			statement += t.text;
		}

		queries.push({
			name,
			command,
			original: statementTokens.map((t) => t.text).join(""),
			statement,
			parameters: [...parameters.values()],
			columns,
			comments,
			line,
		});
	}

	return queries;
};
