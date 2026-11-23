// runtime contract of generated query builders

import type { SQLInputValue } from "node:sqlite";

export type ResultMode = "one" | "many" | "none";
export type ConnectionMode = "r" | "w";
export type RowMode = "object" | "tuple";
export type IntegerMode = "number" | "bigint";

export type BoundQuery<
	DB extends string | undefined,
	RM extends ResultMode,
	CM extends ConnectionMode,
	_Record,
> = {
	database: DB;
	name: string;
	query: string;
	parameters: SQLInputValue[];
	rowMode: RowMode;
	integerMode: IntegerMode;
	resultMode: RM;
	connectionMode: CM;
};

// overloads are necessary, as typescript isn't able to infer record types from a single signature with unions
export type Query<
	DB extends string | undefined,
	RM extends ResultMode,
	CM extends ConnectionMode,
	ParametersNamed,
	ParametersAnonymous,
	RecordRowModeObjectIntegerModeNumber,
	RecordRowModeObjectIntegerModeBigInt,
	RecordRowModeTupleIntegerModeNumber,
	RecordRowModeTupleIntegerModeBigInt,
> = {
	database: DB;
	name: string;
	query: string;
	bind: {
		named(
			parameters: ParametersNamed,
			configuration?: { rowMode: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode?: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "object"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeBigInt>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode?: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeBigInt>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "tuple"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "tuple"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "tuple"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeBigInt>;

		anonymous(
			parameters: ParametersAnonymous,
			configuration?: { rowMode: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode?: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "object"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeBigInt>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode?: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeObjectIntegerModeBigInt>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "tuple"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "tuple"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "tuple"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModeTupleIntegerModeBigInt>;
	};
};
