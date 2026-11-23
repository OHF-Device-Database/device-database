// recognizes result expressions that never yield null, together with their storage class
// deliberately limited to the outermost select list (or `returning` clause) and to unconditional rules,
// anything not recognized remains untyped

import { isTrivia, lex, type Token } from "./lex.ts";

import type { ValueType } from "./analyze.ts";

/**
 * built-in functions that return a value of the same storage class for any input (including null)
 * https://www.sqlite.org/lang_corefunc.html, https://www.sqlite.org/lang_aggfunc.html,
 * https://www.sqlite.org/windowfunctions.html#builtins, https://www.sqlite.org/json1.html
 */
const FUNCTIONS: ReadonlyMap<string, ValueType> = new Map([
	["count", "integer"],
	["total", "real"],
	["typeof", "text"],
	["quote", "text"],
	["concat", "text"],
	["random", "integer"],
	["changes", "integer"],
	["total_changes", "integer"],
	["last_insert_rowid", "integer"],
	["row_number", "integer"],
	["rank", "integer"],
	["dense_rank", "integer"],
	["percent_rank", "real"],
	["cume_dist", "real"],
	["json_array", "text"],
	["json_object", "text"],
	["json_group_array", "text"],
	["json_group_object", "text"],
	["jsonb_array", "blob"],
	["jsonb_object", "blob"],
	["jsonb_group_array", "blob"],
	["jsonb_group_object", "blob"],
]);

const INTEGER = /^[+-]?\s*(?:\d+|0x[0-9a-f]+)$/i;
const INTEGER_MIN = -(2n ** 63n);
const INTEGER_MAX = 2n ** 63n - 1n;
const REAL = /^[+-]?\s*(?:\d+\.\d*|\.\d+|\d+)(?:e[+-]?\d+)?$/i;

const STATEMENT = ["select", "values", "insert", "replace", "update", "delete"];
const COMPOUND = ["union", "intersect", "except"];
const SELECT_LIST_END = [
	"from",
	"where",
	"group",
	"having",
	"window",
	"order",
	"limit",
];

const isKeyword = (token: Token | undefined, ...words: string[]): boolean =>
	token?.kind === "word" && words.includes(token.text.toLowerCase());

const isPunctuation = (token: Token | undefined, text: string): boolean =>
	token?.kind === "other" && token.text === text;

/** nesting depth of every token, parentheses and `case … end` nest, brackets themselves are at their outer depth */
const depthsOf = (tokens: Token[]): number[] => {
	let depth = 0;
	return tokens.map((token) => {
		if (isPunctuation(token, ")") || isKeyword(token, "end")) {
			depth--;
		}
		const current = depth;
		if (isPunctuation(token, "(") || isKeyword(token, "case")) {
			depth++;
		}
		return current;
	});
};

/** splits tokens at top level tokens matching `separator`, the separators themselves are dropped */
const splitTopLevel = (
	tokens: Token[],
	separator: (token: Token) => boolean,
): Token[][] => {
	const depths = depthsOf(tokens);
	const parts: Token[][] = [[]];
	tokens.forEach((token, i) => {
		if (depths[i] === 0 && separator(token)) {
			parts.push([]);
		} else {
			parts.at(-1)?.push(token);
		}
	});
	return parts;
};

/** result expressions of a single select (`undefined` for `values`) */
const selectList = (arm: Token[]): Token[][] | undefined => {
	if (!isKeyword(arm[0], "select")) {
		return undefined;
	}

	const start = isKeyword(arm[1], "distinct", "all") ? 2 : 1;
	const depths = depthsOf(arm);
	let end = arm.findIndex(
		(token, i) =>
			i >= start && depths[i] === 0 && isKeyword(token, ...SELECT_LIST_END),
	);
	end = end === -1 ? arm.length : end;

	return splitTopLevel(arm.slice(start, end), (token) =>
		isPunctuation(token, ","),
	);
};

/**
 * result expressions of a statement, one list per arm of a compound select
 * (`undefined` when the statement isn't understood)
 */
const resultLists = (
	statement: string,
): (Token[][] | undefined)[] | undefined => {
	const tokens = lex(statement).filter(
		(token) => !isTrivia(token) && token.kind !== "semicolon",
	);
	const depths = depthsOf(tokens);

	// common table expressions are parenthesized → first top level statement keyword is the main statement
	const start = tokens.findIndex(
		(token, i) => depths[i] === 0 && isKeyword(token, ...STATEMENT),
	);
	if (start === -1) {
		return undefined;
	}

	const main = tokens.slice(start);
	if (isKeyword(main[0], "select", "values")) {
		return splitTopLevel(main, (token) => isKeyword(token, ...COMPOUND)).map(
			// `union all`
			(arm) => selectList(isKeyword(arm[0], "all") ? arm.slice(1) : arm),
		);
	}

	const mainDepths = depthsOf(main);
	const returning = main.findIndex(
		(token, i) => mainDepths[i] === 0 && isKeyword(token, "returning"),
	);
	if (returning === -1) {
		return [[]];
	}
	return [
		splitTopLevel(main.slice(returning + 1), (token) =>
			isPunctuation(token, ","),
		),
	];
};

/** index after the parenthesized group opening at `open`, `undefined` if there isn't one */
const closing = (tokens: Token[], open: number): number | undefined => {
	if (!isPunctuation(tokens[open], "(")) {
		return undefined;
	}

	let depth = 0;
	for (let i = open; i < tokens.length; i++) {
		if (isPunctuation(tokens[i], "(")) {
			depth++;
		} else if (isPunctuation(tokens[i], ")")) {
			depth--;
			if (depth === 0) {
				return i + 1;
			}
		}
	}
	return undefined;
};

/** `<function>(…) [filter (…)] [over (…) | over <window>]` */
const functionType = (expression: Token[]): ValueType | undefined => {
	const [name] = expression;
	if (name?.kind !== "word") {
		return undefined;
	}
	const type = FUNCTIONS.get(name.text.toLowerCase());
	if (typeof type === "undefined") {
		return undefined;
	}

	let next = closing(expression, 1);
	if (typeof next !== "undefined" && isKeyword(expression[next], "filter")) {
		next = closing(expression, next + 1);
	}
	if (typeof next !== "undefined" && isKeyword(expression[next], "over")) {
		const window = expression[next + 1];
		next =
			window?.kind === "word" || window?.kind === "identifier-quoted"
				? next + 2
				: closing(expression, next + 1);
	}

	return next === expression.length ? type : undefined;
};

/** `<expression> is [not] null`, `<expression> isnull`, `<expression> notnull` */
const isNullTest = (expression: Token[]): boolean => {
	const length = expression.length;
	let operator: number | undefined;
	if (isKeyword(expression[length - 1], "isnull", "notnull")) {
		operator = length - 1;
	} else if (isKeyword(expression[length - 1], "null")) {
		if (isKeyword(expression[length - 2], "is")) {
			operator = length - 2;
		} else if (
			isKeyword(expression[length - 2], "not") &&
			isKeyword(expression[length - 3], "is")
		) {
			operator = length - 3;
		}
	}
	if (typeof operator === "undefined" || operator === 0) {
		return false;
	}

	// operators binding less tightly than `is` would apply to its result instead
	// (`a is null and b` is `(a is null) and b`), `not` also covers `not like`, `not in`, … conservatively
	const operand = expression.slice(0, operator);
	const depths = depthsOf(operand);
	return !operand.some(
		(token, i) =>
			depths[i] === 0 && isKeyword(token, "and", "or", "not", "between"),
	);
};

const classify = (
	source: string,
	expression: Token[],
): ValueType | undefined => {
	const [first] = expression;
	const last = expression.at(-1);
	if (typeof first === "undefined" || typeof last === "undefined") {
		return undefined;
	}

	if (expression.length === 1 && first.kind === "string") {
		return "text";
	}
	if (
		expression.length === 1 &&
		isKeyword(first, "current_date", "current_time", "current_timestamp")
	) {
		return "text";
	}
	if (
		expression.length === 2 &&
		isKeyword(first, "x") &&
		last.kind === "string" &&
		first.end === last.start
	) {
		return "blob";
	}

	const text = source.slice(first.start, last.end);
	if (INTEGER.test(text)) {
		// hexadecimal literals are always integers (two's complement), decimal ones outside of the 64-bit range are read as reals
		if (/0x/i.test(text)) {
			return "integer";
		}
		const value = BigInt(text.replaceAll(/\s/g, ""));
		return value >= INTEGER_MIN && value <= INTEGER_MAX ? "integer" : "real";
	}
	if (REAL.test(text)) {
		return "real";
	}

	const exists = isKeyword(first, "not") ? 1 : 0;
	if (
		isKeyword(expression[exists], "exists") &&
		closing(expression, exists + 1) === expression.length
	) {
		return "integer";
	}

	if (isNullTest(expression)) {
		return "integer";
	}

	return functionType(expression);
};

const isAlias = (token: Token | undefined): boolean =>
	token?.kind === "identifier-quoted" ||
	token?.kind === "string" ||
	(token?.kind === "word" && !/^[0-9]/.test(token.text));

/** `<expression>`, `<expression> <alias>`, `<expression> as <alias>` */
const candidates = (item: Token[]): Token[][] => {
	const result = [item];
	if (item.length > 1 && isAlias(item.at(-1))) {
		result.push(item.slice(0, -1));
		if (item.length > 2 && isKeyword(item.at(-2), "as")) {
			result.push(item.slice(0, -2));
		}
	}
	return result;
};

const nonNullTypeOf = (
	source: string,
	item: Token[],
): ValueType | undefined => {
	for (const expression of candidates(item)) {
		const type = classify(source, expression);
		if (typeof type !== "undefined") {
			return type;
		}
	}
	return undefined;
};

/**
 * storage class of result columns whose expression never yields null, `undefined` for all others
 * compound selects need every arm to agree
 */
export const nonNullTypes = (
	statement: string,
	count: number,
): (ValueType | undefined)[] => {
	const arms = resultLists(statement);

	return Array.from({ length: count }, (_, i) => {
		let type: ValueType | undefined;
		for (const arm of arms ?? []) {
			const item = arm?.[i];
			if (arm?.length !== count || typeof item === "undefined") {
				return undefined;
			}
			const armType = nonNullTypeOf(statement, item);
			if (
				typeof armType === "undefined" ||
				(typeof type !== "undefined" && armType !== type)
			) {
				return undefined;
			}
			type = armType;
		}
		return type;
	});
};
