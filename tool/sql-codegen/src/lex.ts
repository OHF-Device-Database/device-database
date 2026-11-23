// minimal sqlite tokenizer
// only distinguishes what is needed to locate statement boundaries and parameters
// (https://www.sqlite.org/lang_expr.html#varparam), everything semantic is left to sqlite itself

export type TokenKind =
	| "whitespace"
	| "comment-line"
	| "comment-block"
	| "string"
	| "identifier-quoted"
	| "word"
	| "parameter-named"
	| "parameter-positional"
	| "semicolon"
	| "other";

export type Token = {
	kind: TokenKind;
	start: number;
	end: number;
	text: string;
};

export class LexError extends Error {
	readonly offset: number;

	constructor(message: string, offset: number) {
		super(message);
		this.name = "LexError";
		this.offset = offset;
	}
}

const isWordCharacter = (c: string): boolean =>
	(c >= "a" && c <= "z") ||
	(c >= "A" && c <= "Z") ||
	(c >= "0" && c <= "9") ||
	c === "_" ||
	c === "$" ||
	c.charCodeAt(0) >= 0x80;

const isWhitespace = (c: string): boolean =>
	c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

/** scans a quoted section, where the closing quote is escaped by doubling it */
const scanQuoted = (source: string, start: number, close: string): number => {
	let i = start + 1;
	while (i < source.length) {
		if (source[i] === close) {
			if (close !== "]" && source[i + 1] === close) {
				i += 2;
				continue;
			}
			return i + 1;
		}
		i++;
	}

	throw new LexError(
		`unterminated quoted section starting with <${source[start]}>`,
		start,
	);
};

export const lex = (source: string): Token[] => {
	const tokens: Token[] = [];
	const push = (kind: TokenKind, start: number, end: number) => {
		tokens.push({ kind, start, end, text: source.slice(start, end) });
	};

	let i = 0;
	while (i < source.length) {
		const c = source[i] as string;
		const next = source[i + 1];

		if (isWhitespace(c)) {
			let end = i + 1;
			while (end < source.length && isWhitespace(source[end] as string)) {
				end++;
			}
			push("whitespace", i, end);
			i = end;
		} else if (c === "-" && next === "-") {
			let end = source.indexOf("\n", i);
			end = end === -1 ? source.length : end;
			push("comment-line", i, end);
			i = end;
		} else if (c === "/" && next === "*") {
			const close = source.indexOf("*/", i + 2);
			// sqlite tolerates unterminated block comments
			const end = close === -1 ? source.length : close + 2;
			push("comment-block", i, end);
			i = end;
		} else if (c === "'") {
			const end = scanQuoted(source, i, "'");
			push("string", i, end);
			i = end;
		} else if (c === '"' || c === "`") {
			const end = scanQuoted(source, i, c);
			push("identifier-quoted", i, end);
			i = end;
		} else if (c === "[") {
			const end = scanQuoted(source, i, "]");
			push("identifier-quoted", i, end);
			i = end;
		} else if (c === "?") {
			let end = i + 1;
			while (end < source.length && /[0-9]/.test(source[end] as string)) {
				end++;
			}
			push("parameter-positional", i, end);
			i = end;
		} else if (
			(c === ":" || c === "@" || c === "$") &&
			typeof next !== "undefined" &&
			isWordCharacter(next)
		) {
			let end = i + 1;
			while (end < source.length && isWordCharacter(source[end] as string)) {
				end++;
			}
			push("parameter-named", i, end);
			i = end;
		} else if (c === ";") {
			push("semicolon", i, i + 1);
			i++;
		} else if (isWordCharacter(c)) {
			let end = i + 1;
			while (end < source.length && isWordCharacter(source[end] as string)) {
				end++;
			}
			push("word", i, end);
			i = end;
		} else {
			push("other", i, i + 1);
			i++;
		}
	}

	return tokens;
};

export const isTrivia = (token: Token): boolean =>
	token.kind === "whitespace" ||
	token.kind === "comment-line" ||
	token.kind === "comment-block";
