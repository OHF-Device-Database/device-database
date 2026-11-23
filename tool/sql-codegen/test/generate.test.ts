import assert from "node:assert/strict";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

import {
	DEFAULT_TYPES_IMPORT,
	EmitError,
	emit,
	generate,
	generateDirectory,
} from "../src/index.ts";

import type { AnalyzedQuery } from "../src/index.ts";
import type { BoundQuery } from "../src/types.ts";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const TYPES = fileURLToPath(new URL("../src/types.ts", import.meta.url));
const TYPE_ROOTS = fileURLToPath(
	new URL("../node_modules/@types", import.meta.url),
);

const schema = `
create table item (
    id integer primary key,
    name text not null,
    note text,
    price real not null,
    payload blob
);
`;

const source = `
-- name: GetItem :one
-- column: noteLength integer
select id, name, note, length(note) "noteLength" from item where id = @id;

-- name: GetItems :many
-- items cheaper than the given price
select
    id,
    price,
    payload,
    count(*) over () total
from
    item
where
    price < :price and name like @pattern
order by id;

-- name: GetItemOdd :one
select
    id "select",
    name "with space"
from item;

-- name: GetEscapes :one
-- column: value text not null
select '\\' || '\`' || '\${x}' || '*/' value;

-- name: InsertItem :exec
insert into item (name, note, price, payload) values (@name, @note, @price, @payload);

-- name: DeleteItems :exec
delete from item;
`;

const setup = () => {
	const db = new DatabaseSync(":memory:");
	db.exec(schema);
	return db;
};

/** writes generated module next to a copy of the runtime types, in an es module scope */
const scaffold = (files: Record<string, string>) => {
	const directory = mkdtempSync(join(tmpdir(), "sql-codegen-"));
	writeFileSync(join(directory, "package.json"), `{"type":"module"}`);
	copyFileSync(TYPES, join(directory, "types.ts"));
	for (const [name, contents] of Object.entries(files)) {
		writeFileSync(join(directory, name), contents);
	}
	return directory;
};

const typecheck = (directory: string, entry: string): string[] => {
	const program = ts.createProgram([join(directory, entry)], {
		strict: true,
		noEmit: true,
		noUncheckedIndexedAccess: true,
		exactOptionalPropertyTypes: true,
		verbatimModuleSyntax: true,
		erasableSyntaxOnly: true,
		allowImportingTsExtensions: true,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		typeRoots: [TYPE_ROOTS],
		types: ["node"],
	});

	return ts.getPreEmitDiagnostics(program).map((d) => {
		const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
		if (typeof d.file === "undefined" || typeof d.start === "undefined") {
			return message;
		}
		const { line } = d.file.getLineAndCharacterOfPosition(d.start);
		return `${d.file.fileName}:${line + 1}: ${message}`;
	});
};

// type level assertions about the generated module, checked by `typecheck`
const assertions = `
import type { SQLInputValue } from "node:sqlite";
import type { BoundQuery } from "./types.ts";
import { deleteItems, getEscapes, getItem, getItemOdd, getItems, insertItem } from "./queries.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type RecordOf<Q> = Q extends BoundQuery<infer _DB, infer _RM, infer _CM, infer R> ? R : never;
type DiscriminatorsOf<Q> = Q extends BoundQuery<infer DB, infer RM, infer CM, infer _R> ? [DB, RM, CM] : never;

const item = getItem.bind.named({ id: 1 });
const itemTuple = getItem.bind.anonymous([1], { rowMode: "tuple", integerMode: "bigint" });
const items = getItems.bind.named({ price: 1, pattern: "%" }, { integerMode: "bigint" });
const odd = getItemOdd.bind.named({}, { rowMode: "tuple" });
const escapes = getEscapes.bind.anonymous([]);
const insert = insertItem.bind.named({ name: "a", note: null, price: 1, payload: new Uint8Array() });
const remove = deleteItems.bind.anonymous([]);

export type Assertions = [
    Expect<Equal<RecordOf<typeof item>, { id: number; name: string; note: string | null; noteLength: number | null }>>,
    Expect<Equal<RecordOf<typeof itemTuple>, [id: bigint, name: string, note: string | null, noteLength: bigint | null]>>,
    Expect<Equal<RecordOf<typeof items>, { id: bigint; price: number; payload: Uint8Array | null; total: bigint }>>,
    Expect<Equal<RecordOf<typeof odd>, [number, string]>>,
    Expect<Equal<RecordOf<typeof escapes>, { value: string }>>,
    Expect<Equal<RecordOf<typeof insert>, never>>,
    Expect<Equal<DiscriminatorsOf<typeof item>, ["test", "one", "r"]>>,
    Expect<Equal<DiscriminatorsOf<typeof items>, ["test", "many", "r"]>>,
    Expect<Equal<DiscriminatorsOf<typeof remove>, ["test", "none", "w"]>>,
    Expect<Equal<Parameters<typeof getItems.bind.named>[0], { price: SQLInputValue; pattern: SQLInputValue }>>,
    Expect<Equal<Parameters<typeof getItems.bind.anonymous>[0], [price: SQLInputValue, pattern: SQLInputValue]>>,
    Expect<Equal<Parameters<typeof getEscapes.bind.named>[0], Record<string, never>>>,
    Expect<Equal<Parameters<typeof getEscapes.bind.anonymous>[0], []>>,
];

// @ts-expect-error missing parameter
getItems.bind.named({ price: 1 });
// @ts-expect-error unknown parameter
getEscapes.bind.named({ unknown: 1 });
`;

const execute = (
	db: DatabaseSync,
	bound: BoundQuery<string, "one" | "many" | "none", "r" | "w", unknown>,
) => {
	const statement = db.prepare(bound.query);
	statement.setReturnArrays(bound.rowMode === "tuple");
	statement.setReadBigInts(bound.integerMode === "bigint");
	switch (bound.resultMode) {
		case "one":
			return statement.get(...bound.parameters);
		case "many":
			return statement.all(...bound.parameters);
		case "none":
			return statement.run(...bound.parameters);
	}
};

test("generate", async (t) => {
	const db = setup();
	const generated = generate(source, {
		db,
		database: "test",
		typesImport: "./types.ts",
		path: "queries.sql",
	});

	const directory = scaffold({
		"queries.ts": generated,
		"assertions.ts": assertions,
	});
	t.after(() => rmSync(directory, { recursive: true, force: true }));

	await t.test("type checks with expected record and parameter types", () => {
		assert.deepEqual(typecheck(directory, "assertions.ts"), []);
	});

	await t.test("is valid erasable typescript", async () => {
		const queries = await import(
			pathToFileURL(join(directory, "queries.ts")).href
		);
		assert.deepEqual(Object.keys(queries).sort(), [
			"deleteItems",
			"getEscapes",
			"getItem",
			"getItemOdd",
			"getItems",
			"insertItem",
		]);
	});

	await t.test("binds parameters and executes", async () => {
		const queries = await import(
			pathToFileURL(join(directory, "queries.ts")).href
		);

		execute(
			db,
			queries.insertItem.bind.named({
				name: "apple",
				note: null,
				price: 1.5,
				payload: new Uint8Array([1]),
			}),
		);
		execute(db, queries.insertItem.bind.anonymous(["pear", "ripe", 3, null]));

		assert.deepEqual(
			{ ...execute(db, queries.getItem.bind.named({ id: 2 })) },
			{ id: 2, name: "pear", note: "ripe", noteLength: 4 },
		);
		assert.deepEqual(
			execute(
				db,
				queries.getItem.bind.anonymous([1], {
					rowMode: "tuple",
					integerMode: "bigint",
				}),
			),
			[1n, "apple", null, null],
		);

		// parameters that are referenced more than once, or out of order
		const many = execute(
			db,
			queries.getItems.bind.named({ pattern: "%", price: 10 }),
		) as Record<string, unknown>[];
		assert.deepEqual(
			many.map((row) => [row.id, row.total]),
			[
				[1, 2],
				[2, 2],
			],
		);

		assert.deepEqual(
			{ ...execute(db, queries.getEscapes.bind.anonymous([])) },
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder syntax is what's being escaped
			{ value: "\\`${x}*/" },
		);

		execute(db, queries.deleteItems.bind.anonymous([]));
		assert.equal(execute(db, queries.getItem.bind.named({ id: 1 })), undefined);
	});

	await t.test("query text starts with annotation line", async () => {
		const queries = await import(
			pathToFileURL(join(directory, "queries.ts")).href
		);
		const [header, ...rest] = (queries.deleteItems.query as string).split("\n");
		assert.equal(header, "-- name: DeleteItems :exec");
		assert.equal(rest.join("\n"), "delete from item");
	});

	await t.test("documents original statement", () => {
		assert.match(
			generated,
			/ \* -- name: GetItem :one\n \* -- column: noteLength integer\n \* select/,
		);
		assert.match(
			generated,
			/ \* -- name: GetItems :many\n \* -- items cheaper than the given price\n \* select/,
		);
		assert.match(generated, / \* {5}price < :price and name like @pattern/);
		// can't terminate documentation comment early
		assert.match(generated, /'\*\\\/' value/);
	});

	await t.test("labels tuple members when possible", () => {
		assert.match(
			generated,
			/type GetItemRecordRowModeTupleIntegerModeNumber = \[\s*id: number,/,
		);
		// keywords and non-identifiers can't be labels, which can't be mixed with unlabeled members
		assert.match(
			generated,
			/type GetItemOddRecordRowModeTupleIntegerModeNumber = \[\s*number,\s*string\s*\]/,
		);
	});

	await t.test("only imports SQLInputValue when used", () => {
		assert.match(
			generated,
			/import type \{ SQLInputValue \} from "node:sqlite";/,
		);

		const parameterless = generate("-- name: GetOne :one\nselect 1 one;", {
			db,
			database: "test",
			typesImport: "./types.ts",
		});
		assert.doesNotMatch(parameterless, /SQLInputValue/);
	});
});

test("imports types from own package by default", async () => {
	const { name } = JSON.parse(
		readFileSync(join(PACKAGE, "package.json"), "utf8"),
	) as { name: string };
	assert.equal(DEFAULT_TYPES_IMPORT, `${name}/types`);

	const db = setup();
	const generated = generate(
		"-- name: GetItem :one\nselect id, name from item where id = @id;",
		{ db, database: "test" },
	);
	assert.ok(
		generated.includes(
			`import type { BoundQuery, Query } from "${DEFAULT_TYPES_IMPORT}";`,
		),
	);

	// within the package, its own name resolves via "exports", like it does for consumers depending on it
	const directory = mkdtempSync(join(PACKAGE, ".tmp-"));
	try {
		writeFileSync(join(directory, "queries.ts"), generated);
		writeFileSync(
			join(directory, "assertions.ts"),
			`
import type { BoundQuery } from "${DEFAULT_TYPES_IMPORT}";
import { getItem } from "./queries.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type RecordOf<Q> = Q extends BoundQuery<infer _DB, infer _RM, infer _CM, infer R> ? R : never;

const item = getItem.bind.named({ id: 1 });

export type Assertions = [
    Expect<Equal<RecordOf<typeof item>, { id: number; name: string }>>,
];
`,
		);

		assert.deepEqual(typecheck(directory, "assertions.ts"), []);

		// type-only import is erased, nothing needs to resolve at runtime
		const queries = await import(
			pathToFileURL(join(directory, "queries.ts")).href
		);
		assert.equal(queries.getItem.name, "GetItem");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("emit rejects duplicate query names", () => {
	const query: AnalyzedQuery = {
		name: "GetA",
		command: ":exec",
		connectionMode: "r",
		original: "select 1",
		statement: "select 1",
		comments: [],
		parameters: [],
		columns: [],
	};

	assert.throws(
		() =>
			emit([query, { ...query }], {
				database: "test",
				typesImport: "./types.ts",
			}),
		EmitError,
	);
});

test("generateDirectory", () => {
	const db = setup();
	const directory = mkdtempSync(join(tmpdir(), "sql-codegen-"));
	const out = join(directory, "out");
	mkdirSync(out);

	try {
		writeFileSync(
			join(directory, "b.sql"),
			"-- name: GetB :one\nselect id from item;",
		);
		writeFileSync(
			join(directory, "a.sql"),
			"-- name: DeleteA :exec\ndelete from item;",
		);
		writeFileSync(join(directory, "ignored.txt"), "");

		const generated = generateDirectory({
			db,
			database: "test",
			typesImport: "../types.ts",
			directory,
			outDirectory: out,
		});

		assert.deepEqual(generated, [
			{ source: join(directory, "a.sql"), output: join(out, "a.ts") },
			{ source: join(directory, "b.sql"), output: join(out, "b.ts") },
		]);
		assert.deepEqual(readdirSync(out).sort(), ["a.ts", "b.ts"]);
		assert.match(
			readFileSync(join(out, "b.ts"), "utf8"),
			/^\/\/ generated by sql-codegen from b\.sql, do not edit\n/,
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
