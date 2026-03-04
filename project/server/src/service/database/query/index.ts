// types vendored from `sqlc-generate-typescript-plugin`

import type { SQLInputValue } from "node:sqlite";

export type ResultMode = "one" | "many" | "none";
export type ConnectionMode = "r" | "w";

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
	rowMode: "object" | "tuple";
	integerMode: "number" | "bigint";
	resultMode: RM;
	connectionMode: CM;
};

export type Query<
  DB extends string | undefined,
	RM extends ResultMode,
	CM extends ConnectionMode,
	ParametersNamed,
	ParametersAnonymous,
	RecordRowModObjectIntegerModeNumber,
	RecordRowModObjectIntegerModeBigInt,
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
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode?: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "object"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeBigInt>;
		named(
			parameters: ParametersNamed,
			configuration: { rowMode?: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeBigInt>;
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
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode?: "object"; integerMode: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "object"; integerMode?: "number" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeNumber>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeBigInt>;
		anonymous(
			parameters: ParametersAnonymous,
			configuration: { rowMode?: "object"; integerMode: "bigint" },
		): BoundQuery<DB, RM, CM, RecordRowModObjectIntegerModeBigInt>;
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
