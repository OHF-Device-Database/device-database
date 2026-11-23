import type { DatabaseSync, StatementColumnMetadata } from "node:sqlite";
import { constants } from "node:sqlite";

import { isTrivia, lex } from "./lex.ts";

import type {
	Command,
	SourceColumnAnnotation,
	SourceParameter,
	SourceQuery,
} from "./source.ts";

/** storage class a column is expected to hold, derived from its declared type */
export type ValueType =
	| "integer"
	| "real"
	| "numeric"
	| "text"
	| "blob"
	| "any";

export type AnalyzedColumn = {
	name: string;
	/** `undefined` when the column doesn't originate from a table column (e.g. an expression) */
	type: ValueType | undefined;
	nullable: boolean;
	origin: { database: string; table: string; column: string } | undefined;
	/** type was provided by a `-- column:` annotation */
	annotated: boolean;
};

export type ConnectionMode = "r" | "w";

export type AnalyzedQuery = {
	name: string;
	command: Command;
	connectionMode: ConnectionMode;
	original: string;
	statement: string;
	comments: string[];
	parameters: SourceParameter[];
	columns: AnalyzedColumn[];
};

export class AnalyzeError extends Error {
	readonly query: string;

	constructor(query: string, message: string, options?: ErrorOptions) {
		super(`query <${query}>: ${message}`, options);
		this.name = "AnalyzeError";
		this.query = query;
	}
}

const ACTIONS = {
	Get: "r",
	Insert: "w",
	Update: "w",
	Upsert: "w",
	Delete: "w",
} as const satisfies Record<string, ConnectionMode>;

const NAME_FORMAT = /^(?<action>[A-Z][a-z]+)[A-Za-z0-9]*$/;

const connectionModeOf = (name: string): ConnectionMode => {
	const action = NAME_FORMAT.exec(name)?.groups?.action;
	if (typeof action === "undefined") {
		throw new AnalyzeError(
			name,
			`malformed name (examples: "GetFoo", "InsertBar", "UpdateBazWithQux", "DeleteFooWithBar")`,
		);
	}

	if (!Object.hasOwn(ACTIONS, action)) {
		throw new AnalyzeError(
			name,
			`unexpected name prefix <${action}> (allowed: ${Object.keys(ACTIONS)
				.map((a) => `"${a}"`)
				.join(", ")})`,
		);
	}

	return ACTIONS[action as keyof typeof ACTIONS];
};

/** https://www.sqlite.org/datatype3.html#determination_of_column_affinity */
export const valueTypeOf = (declared: string): ValueType => {
	const normalized = declared.toUpperCase();
	if (normalized.includes("INT")) {
		return "integer";
	}
	if (
		normalized.includes("CHAR") ||
		normalized.includes("CLOB") ||
		normalized.includes("TEXT")
	) {
		return "text";
	}
	if (normalized.includes("BLOB")) {
		return "blob";
	}
	// no declared type → no affinity, any value can be stored (same as "ANY" in strict tables)
	if (normalized === "" || normalized === "ANY") {
		return "any";
	}
	if (
		normalized.includes("REAL") ||
		normalized.includes("FLOA") ||
		normalized.includes("DOUB")
	) {
		return "real";
	}
	return "numeric";
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

type CatalogColumn = { nullable: boolean };

/** looks up column metadata from the schema of the provided database, memoized per table */
class Catalog {
	private readonly db: DatabaseSync;
	private readonly tables = new Map<string, Map<string, CatalogColumn>>();

	constructor(db: DatabaseSync) {
		this.db = db;
	}

	column(
		database: string,
		table: string,
		column: string,
	): CatalogColumn | undefined {
		const key = `${database}\0${table}`;
		let columns = this.tables.get(key);
		if (typeof columns === "undefined") {
			columns = this.load(database, table);
			this.tables.set(key, columns);
		}
		return columns.get(column);
	}

	private load(database: string, table: string): Map<string, CatalogColumn> {
		const list = this.db
			.prepare(`pragma ${quote(database)}.table_list(${quote(table)})`)
			.get() as { wr: number } | undefined;
		const info = this.db
			.prepare(`pragma ${quote(database)}.table_xinfo(${quote(table)})`)
			.all() as { name: string; type: string; notnull: number; pk: number }[];

		// `notnull` already reflects primary keys of strict and "without rowid" tables
		// "integer primary key" of rowid tables aliases the rowid, which can't be null either
		// https://www.sqlite.org/lang_createtable.html#rowid
		const pks = info.filter((c) => c.pk > 0);
		const rowidAlias =
			list?.wr === 0 &&
			pks.length === 1 &&
			pks[0]?.type.toUpperCase() === "INTEGER"
				? pks[0].name
				: undefined;

		return new Map(
			info.map((c) => [
				c.name,
				{ nullable: c.notnull === 0 && c.name !== rowidAlias },
			]),
		);
	}
}

const OUTER_JOIN = new Set(["left", "right", "full"]);

/**
 * `.columns()` reports the origin column, but not whether the origin was outer joined
 * without examining the query plan this can't be resolved per column → considered nullable when any outer join is present
 */
const hasOuterJoin = (statement: string): boolean => {
	const words = lex(statement)
		.filter((t) => !isTrivia(t))
		.map((t) => (t.kind === "word" ? t.text.toLowerCase() : undefined));

	return words.some(
		(word, i) =>
			typeof word !== "undefined" &&
			OUTER_JOIN.has(word) &&
			(words[i + 1] === "join" || words[i + 1] === "outer"),
	);
};

const WRITE_ACTIONS: ReadonlySet<number> = new Set([
	constants.SQLITE_INSERT,
	constants.SQLITE_UPDATE,
	constants.SQLITE_DELETE,
]);

export class Analyzer {
	private readonly db: DatabaseSync;
	private readonly catalog: Catalog;

	constructor(db: DatabaseSync) {
		this.db = db;
		this.catalog = new Catalog(db);
	}

	analyze(query: SourceQuery): AnalyzedQuery {
		const connectionMode = connectionModeOf(query.name);

		let writes = false;
		let columns: StatementColumnMetadata[];
		this.db.setAuthorizer((action) => {
			if (WRITE_ACTIONS.has(action)) {
				writes = true;
			}
			return constants.SQLITE_OK;
		});
		try {
			columns = this.db.prepare(query.statement).columns();
		} catch (e) {
			throw new AnalyzeError(
				query.name,
				`preparation failed (${e instanceof Error ? e.message : String(e)})`,
				{ cause: e },
			);
		} finally {
			this.db.setAuthorizer(null);
		}

		if (connectionMode === "r" && writes) {
			throw new AnalyzeError(
				query.name,
				`named as reading query, but writes (use one of the "Insert", "Update", "Upsert", "Delete" prefixes)`,
			);
		}

		if (query.command !== ":exec" && columns.length === 0) {
			throw new AnalyzeError(
				query.name,
				`<${query.command}> query doesn't return any columns (use ":exec" instead)`,
			);
		}

		const seen = new Set<string>();
		for (const column of columns) {
			if (seen.has(column.name)) {
				throw new AnalyzeError(
					query.name,
					`duplicate column name <${column.name}> (would collapse in object row mode, alias it)`,
				);
			}
			seen.add(column.name);
		}

		const outerJoin = hasOuterJoin(query.statement);

		const annotations = new Map<string, SourceColumnAnnotation>();
		for (const annotation of query.columns) {
			if (annotations.has(annotation.name)) {
				throw new AnalyzeError(
					query.name,
					`column <${annotation.name}> annotated more than once`,
				);
			}
			if (!seen.has(annotation.name)) {
				throw new AnalyzeError(
					query.name,
					`annotated column <${annotation.name}> isn't returned (returned: ${[...seen].map((c) => `<${c}>`).join(", ") || "none"})`,
				);
			}
			annotations.set(annotation.name, annotation);
		}

		return {
			name: query.name,
			command: query.command,
			connectionMode,
			original: query.original,
			statement: query.statement,
			comments: query.comments,
			parameters: query.parameters,
			columns: columns.map((column) => {
				const analyzed = this.column(column, outerJoin);
				const annotation = annotations.get(column.name);
				return typeof annotation === "undefined"
					? analyzed
					: {
							...analyzed,
							type: valueTypeOf(annotation.declared),
							nullable: !annotation.notNull,
							annotated: true,
						};
			}),
		};
	}

	private column(
		column: StatementColumnMetadata,
		outerJoin: boolean,
	): AnalyzedColumn {
		if (
			column.database === null ||
			column.table === null ||
			column.column === null
		) {
			return {
				name: column.name,
				type: undefined,
				nullable: true,
				origin: undefined,
				annotated: false,
			};
		}

		const origin = {
			database: column.database,
			table: column.table,
			column: column.column,
		};
		const catalogued = this.catalog.column(
			origin.database,
			origin.table,
			origin.column,
		);

		return {
			name: column.name,
			type: valueTypeOf(column.type ?? ""),
			nullable: outerJoin || (catalogued?.nullable ?? true),
			origin,
			annotated: false,
		};
	}
}
