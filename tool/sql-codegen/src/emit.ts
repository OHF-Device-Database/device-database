import ts from "typescript";

import type { AnalyzedColumn, AnalyzedQuery, ValueType } from "./analyze.ts";
import type { IntegerMode, ResultMode, RowMode } from "./types.ts";

const f = ts.factory;

export type EmitOptions = {
	/** database name, used as literal type discriminator on `Query` / `BoundQuery` */
	database: string;
	/**
	 * module specifier that `Query` and `BoundQuery` are imported from
	 * @default "sql-codegen/types"
	 */
	typesImport?: string | undefined;
	/** mentioned in header comment */
	sourceName?: string | undefined;
};

/** this package's own `./types` export (type-only import, so a dev dependency suffices) */
export const DEFAULT_TYPES_IMPORT = "sql-codegen/types";

export class EmitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EmitError";
	}
}

const RESULT_MODE = {
	":one": "one",
	":many": "many",
	":exec": "none",
} as const satisfies Record<AnalyzedQuery["command"], ResultMode>;

const RECORD_VARIANTS = [
	{
		rowMode: "object",
		integerMode: "number",
		suffix: "RecordRowModeObjectIntegerModeNumber",
	},
	{
		rowMode: "object",
		integerMode: "bigint",
		suffix: "RecordRowModeObjectIntegerModeBigInt",
	},
	{
		rowMode: "tuple",
		integerMode: "number",
		suffix: "RecordRowModeTupleIntegerModeNumber",
	},
	{
		rowMode: "tuple",
		integerMode: "bigint",
		suffix: "RecordRowModeTupleIntegerModeBigInt",
	},
] as const satisfies {
	rowMode: RowMode;
	integerMode: IntegerMode;
	suffix: string;
}[];

const PARAMETERS_NAMED_SUFFIX = "ParametersNamed";
const PARAMETERS_ANONYMOUS_SUFFIX = "ParametersAnonymous";

const keyword = (
	kind:
		| ts.SyntaxKind.StringKeyword
		| ts.SyntaxKind.NumberKeyword
		| ts.SyntaxKind.BigIntKeyword
		| ts.SyntaxKind.UnknownKeyword
		| ts.SyntaxKind.NeverKeyword,
) => f.createKeywordTypeNode(kind);

const literalType = (value: string) =>
	f.createLiteralTypeNode(f.createStringLiteral(value));

const reference = (name: string, args?: readonly ts.TypeNode[]) =>
	f.createTypeReferenceNode(name, args);

const nullType = () => f.createLiteralTypeNode(f.createNull());

/** parameters can't be inferred without examining the query plan → any value sqlite accepts */
const parameterType = (): ts.TypeNode => reference("SQLInputValue");

const columnBaseTypes = (
	type: ValueType,
	integerMode: IntegerMode,
): ts.TypeNode[] | undefined => {
	const integer =
		integerMode === "bigint"
			? keyword(ts.SyntaxKind.BigIntKeyword)
			: keyword(ts.SyntaxKind.NumberKeyword);

	switch (type) {
		case "integer":
			return [integer];
		case "real":
			return [keyword(ts.SyntaxKind.NumberKeyword)];
		case "numeric":
			// numeric affinity stores integers when lossless, otherwise reals
			return integerMode === "bigint"
				? [keyword(ts.SyntaxKind.NumberKeyword), integer]
				: [keyword(ts.SyntaxKind.NumberKeyword)];
		case "text":
			return [keyword(ts.SyntaxKind.StringKeyword)];
		case "blob":
			return [reference("Uint8Array")];
		case "any":
			return undefined;
	}
};

const columnType = (
	column: AnalyzedColumn,
	integerMode: IntegerMode,
): ts.TypeNode => {
	const base =
		typeof column.type === "undefined"
			? undefined
			: columnBaseTypes(column.type, integerMode);
	if (typeof base === "undefined") {
		return keyword(ts.SyntaxKind.UnknownKeyword);
	}

	const members = column.nullable ? [...base, nullType()] : base;
	return members.length === 1
		? (members[0] as ts.TypeNode)
		: f.createUnionTypeNode(members);
};

/** identifier that isn't a keyword, according to the typescript scanner */
const isLabel = (name: string) => {
	const scanner = ts.createScanner(
		ts.ScriptTarget.ESNext,
		true,
		ts.LanguageVariant.Standard,
		name,
	);
	return (
		scanner.scan() === ts.SyntaxKind.Identifier &&
		scanner.getTokenEnd() === name.length
	);
};

/** labels are only emitted when every member can be labeled, typescript disallows mixing */
const tupleType = (
	members: readonly { name: string; type: ts.TypeNode }[],
): ts.TypeNode => {
	const labeled = members.every((m) => isLabel(m.name));
	return f.createTupleTypeNode(
		members.map((m) =>
			labeled
				? f.createNamedTupleMember(
						undefined,
						f.createIdentifier(m.name),
						undefined,
						m.type,
					)
				: m.type,
		),
	);
};

const objectType = (
	members: readonly { name: string; type: ts.TypeNode }[],
): ts.TypeNode =>
	f.createTypeLiteralNode(
		members.map((m) =>
			f.createPropertySignature(
				undefined,
				f.createStringLiteral(m.name),
				undefined,
				m.type,
			),
		),
	);

const typeAlias = (name: string, type: ts.TypeNode) =>
	f.createTypeAliasDeclaration(undefined, name, undefined, type);

/** escapes text so that the cooked value of the template literal equals the text */
const templateRaw = (text: string) =>
	text
		.replaceAll("\\", "\\\\")
		.replaceAll("`", "\\`")
		.replaceAll("${", "\\${")
		.replaceAll("\r", "\\r");

const documentation = <T extends ts.Node>(node: T, query: AnalyzedQuery): T => {
	const lines = [
		`-- name: ${query.name} ${query.command}`,
		...query.comments.flatMap((comment) => comment.split(/\r?\n/)),
		...query.original.split(/\r?\n/),
	].map((line) => line.replaceAll("*/", "*\\/"));

	const text = [
		"*",
		" * ```sql",
		...lines.map((line) => (line === "" ? " *" : ` * ${line}`)),
		" * ```",
		" ",
	].join("\n");

	return ts.addSyntheticLeadingComment(
		node,
		ts.SyntaxKind.MultiLineCommentTrivia,
		text,
		true,
	);
};

const lowercaseFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** statement prefixed with its sqlc-style annotation on a separate first line */
const queryText = (query: AnalyzedQuery): string =>
	`-- name: ${query.name} ${query.command}\n${query.statement}`;

const queryStatements = (
	query: AnalyzedQuery,
	options: EmitOptions,
): ts.Statement[] => {
	const valueName = lowercaseFirst(query.name);
	if (!isLabel(valueName)) {
		throw new EmitError(
			`query <${query.name}>: <${valueName}> isn't a valid identifier`,
		);
	}

	const resultMode = RESULT_MODE[query.command];
	const typeName = (suffix: string) => `${query.name}${suffix}`;

	const statements: ts.Statement[] = [];

	// parameters
	const parameters = query.parameters.map((p) => ({
		name: p.name,
		type: parameterType(),
	}));
	statements.push(
		typeAlias(
			typeName(PARAMETERS_NAMED_SUFFIX),
			parameters.length > 0
				? objectType(parameters)
				: reference("Record", [
						keyword(ts.SyntaxKind.StringKeyword),
						keyword(ts.SyntaxKind.NeverKeyword),
					]),
		),
		typeAlias(typeName(PARAMETERS_ANONYMOUS_SUFFIX), tupleType(parameters)),
	);

	// records
	const returnsRecords = resultMode !== "none";
	for (const variant of RECORD_VARIANTS) {
		let type: ts.TypeNode;
		if (!returnsRecords) {
			type = keyword(ts.SyntaxKind.NeverKeyword);
		} else {
			const members = query.columns.map((c) => ({
				name: c.name,
				type: columnType(c, variant.integerMode),
			}));
			type =
				variant.rowMode === "object" ? objectType(members) : tupleType(members);
		}
		statements.push(typeAlias(typeName(variant.suffix), type));
	}

	// query
	const discriminators = [
		literalType(options.database),
		literalType(resultMode),
		literalType(query.connectionMode),
	];

	const boundReturnType = f.createUnionTypeNode(
		RECORD_VARIANTS.map((variant) =>
			reference("BoundQuery", [
				...discriminators,
				reference(typeName(variant.suffix)),
			]),
		),
	);

	const configurationParameter = f.createParameterDeclaration(
		undefined,
		undefined,
		"configuration",
		f.createToken(ts.SyntaxKind.QuestionToken),
		f.createTypeLiteralNode([
			f.createPropertySignature(
				undefined,
				"rowMode",
				f.createToken(ts.SyntaxKind.QuestionToken),
				f.createUnionTypeNode([literalType("object"), literalType("tuple")]),
			),
			f.createPropertySignature(
				undefined,
				"integerMode",
				f.createToken(ts.SyntaxKind.QuestionToken),
				f.createUnionTypeNode([literalType("number"), literalType("bigint")]),
			),
		]),
	);

	const configured = (property: "rowMode" | "integerMode", fallback: string) =>
		f.createBinaryExpression(
			f.createPropertyAccessChain(
				f.createIdentifier("configuration"),
				f.createToken(ts.SyntaxKind.QuestionDotToken),
				property,
			),
			ts.SyntaxKind.QuestionQuestionToken,
			f.createStringLiteral(fallback),
		);

	const binder = (
		kind: "named" | "anonymous",
		parametersExpression: ts.Expression,
	) =>
		f.createPropertyAssignment(
			kind,
			f.createArrowFunction(
				undefined,
				undefined,
				[
					f.createParameterDeclaration(
						undefined,
						undefined,
						"parameters",
						undefined,
						reference(
							typeName(
								kind === "named"
									? PARAMETERS_NAMED_SUFFIX
									: PARAMETERS_ANONYMOUS_SUFFIX,
							),
						),
					),
					configurationParameter,
				],
				boundReturnType,
				f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
				f.createBlock(
					[
						f.createReturnStatement(
							f.createObjectLiteralExpression(
								[
									...(["database", "name", "query"] as const).map((key) =>
										f.createPropertyAssignment(
											key,
											f.createPropertyAccessExpression(
												f.createIdentifier(valueName),
												key,
											),
										),
									),
									f.createPropertyAssignment(
										"parameters",
										parametersExpression,
									),
									f.createPropertyAssignment(
										"rowMode",
										configured("rowMode", "object"),
									),
									f.createPropertyAssignment(
										"integerMode",
										configured("integerMode", "number"),
									),
									f.createPropertyAssignment(
										"resultMode",
										f.createStringLiteral(resultMode),
									),
									f.createPropertyAssignment(
										"connectionMode",
										f.createStringLiteral(query.connectionMode),
									),
								],
								true,
							),
						),
					],
					true,
				),
			),
		);

	const value = f.createObjectLiteralExpression(
		[
			f.createPropertyAssignment(
				"database",
				f.createStringLiteral(options.database),
			),
			f.createPropertyAssignment("name", f.createStringLiteral(query.name)),
			f.createPropertyAssignment(
				"query",
				f.createNoSubstitutionTemplateLiteral(
					queryText(query),
					templateRaw(queryText(query)),
				),
			),
			f.createPropertyAssignment(
				"bind",
				f.createObjectLiteralExpression(
					[
						binder(
							"named",
							f.createArrayLiteralExpression(
								query.parameters.map((p) =>
									f.createElementAccessExpression(
										f.createIdentifier("parameters"),
										f.createStringLiteral(p.name),
									),
								),
								true,
							),
						),
						binder("anonymous", f.createIdentifier("parameters")),
					],
					true,
				),
			),
		],
		true,
	);

	statements.push(
		documentation(
			f.createVariableStatement(
				[f.createModifier(ts.SyntaxKind.ExportKeyword)],
				f.createVariableDeclarationList(
					[
						f.createVariableDeclaration(
							valueName,
							undefined,
							reference("Query", [
								...discriminators,
								reference(typeName(PARAMETERS_NAMED_SUFFIX)),
								reference(typeName(PARAMETERS_ANONYMOUS_SUFFIX)),
								...RECORD_VARIANTS.map((variant) =>
									reference(typeName(variant.suffix)),
								),
							]),
							f.createAsExpression(value, reference("const")),
						),
					],
					ts.NodeFlags.Const,
				),
			),
			query,
		),
	);

	return statements;
};

const importTypes = (names: string[], specifier: string) =>
	f.createImportDeclaration(
		undefined,
		f.createImportClause(
			ts.SyntaxKind.TypeKeyword,
			undefined,
			f.createNamedImports(
				names.map((name) =>
					f.createImportSpecifier(false, undefined, f.createIdentifier(name)),
				),
			),
		),
		f.createStringLiteral(specifier),
	);

/** emits a module containing query builders for all provided queries */
export const emit = (
	queries: readonly AnalyzedQuery[],
	options: EmitOptions,
): string => {
	const names = new Set<string>();
	for (const query of queries) {
		if (names.has(query.name)) {
			throw new EmitError(`duplicate query name <${query.name}>`);
		}
		names.add(query.name);
	}

	const imports: ts.Statement[] = [
		importTypes(
			["BoundQuery", "Query"],
			options.typesImport ?? DEFAULT_TYPES_IMPORT,
		),
	];
	if (queries.some((query) => query.parameters.length > 0)) {
		imports.unshift(importTypes(["SQLInputValue"], "node:sqlite"));
	}
	ts.addSyntheticLeadingComment(
		imports[0] as ts.Statement,
		ts.SyntaxKind.SingleLineCommentTrivia,
		` generated by sql-codegen${typeof options.sourceName === "undefined" ? "" : ` from ${options.sourceName}`}, do not edit`,
		true,
	);

	const groups: ts.Statement[][] = [
		imports,
		...queries.map((query) => queryStatements(query, options)),
	];

	const file = f.createSourceFile(
		groups.flat(),
		f.createToken(ts.SyntaxKind.EndOfFileToken),
		ts.NodeFlags.None,
	);
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

	return `${groups
		.map((group) =>
			group
				.map((statement) =>
					printer.printNode(ts.EmitHint.Unspecified, statement, file),
				)
				.join("\n"),
		)
		.join("\n\n")}\n`;
};
