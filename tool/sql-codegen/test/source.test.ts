import assert from "node:assert/strict";
import { test } from "node:test";

import { lex } from "../src/lex.ts";
import { parseSource, SourceError } from "../src/source.ts";

test("lex", async (t) => {
	await t.test("distinguishes parameters from look-alikes", () => {
		const tokens = lex(
			`select :a, @b, $c, ?, ?12, ':d', "@e", [$f], \`:g\` -- @h\n/* :i */`,
		).filter((t) => t.kind.startsWith("parameter"));

		assert.deepEqual(
			tokens.map((t) => [t.kind, t.text]),
			[
				["parameter-named", ":a"],
				["parameter-named", "@b"],
				["parameter-named", "$c"],
				["parameter-positional", "?"],
				["parameter-positional", "?12"],
			],
		);
	});

	await t.test("handles escaped quotes", () => {
		const tokens = lex(`'it''s' "a""b" 'back\\'`);
		assert.deepEqual(
			tokens.filter((t) => t.kind !== "whitespace").map((t) => t.text),
			[`'it''s'`, `"a""b"`, `'back\\'`],
		);
	});

	await t.test("reproduces source", () => {
		const source = `select 1; -- x\n/* y */ select 'z';`;
		assert.equal(
			lex(source)
				.map((t) => t.text)
				.join(""),
			source,
		);
	});
});

test("parseSource", async (t) => {
	await t.test("splits annotated statements", () => {
		const queries = parseSource(
			[
				"-- name: GetA :one",
				"select 1 a;",
				"",
				"-- name: GetB :many",
				"select 2 b;",
				"-- name: DeleteC :exec",
				"delete from c -- trailing",
				"",
			].join("\n"),
		);

		assert.deepEqual(
			queries.map((q) => [q.name, q.command, q.statement, q.line]),
			[
				["GetA", ":one", "select 1 a", 1],
				["GetB", ":many", "select 2 b", 4],
				["DeleteC", ":exec", "delete from c", 6],
			],
		);
	});

	await t.test("rewrites named parameters in order of first appearance", () => {
		const [query] = parseSource(
			"-- name: GetA :one\nselect @b, :a, @b, $c, '@d';",
		);

		assert.equal(query?.statement, "select ?1, ?2, ?1, ?3, '@d'");
		assert.equal(query?.original, "select @b, :a, @b, $c, '@d'");
		assert.deepEqual(query?.parameters, [
			{ name: "b", index: 1 },
			{ name: "a", index: 2 },
			{ name: "c", index: 3 },
		]);
	});

	await t.test("collects column annotations and comments", () => {
		const [query] = parseSource(
			[
				"-- name: GetA :one",
				"-- column: count integer not null",
				`-- column: "odd ""name""" varchar(10)`,
				"-- explains something",
				"/* block */",
				"select 1;",
			].join("\n"),
		);

		assert.deepEqual(query?.columns, [
			{ name: "count", declared: "integer", notNull: true, line: 2 },
			{ name: `odd "name"`, declared: "varchar(10)", notNull: false, line: 3 },
		]);
		assert.deepEqual(query?.comments, [
			"-- column: count integer not null",
			`-- column: "odd ""name""" varchar(10)`,
			"-- explains something",
			"/* block */",
		]);
	});

	const rejects = (source: string, line: number, message: RegExp) => {
		assert.throws(
			() => parseSource(source, "q.sql"),
			(e: unknown) => {
				assert.ok(e instanceof SourceError);
				assert.equal(e.line, line);
				assert.equal(e.path, "q.sql");
				assert.match(e.message, message);
				return true;
			},
		);
	};

	await t.test("rejects positional parameters", () => {
		rejects("-- name: GetA :one\nselect\n?;", 3, /positional parameter <\?>/);
		rejects("-- name: GetA :one\nselect ?1;", 2, /positional parameter <\?1>/);
	});

	await t.test("rejects statements without annotation", () => {
		rejects("-- comment\nselect 1;", 2, /without preceding annotation/);
		rejects(
			"-- name: GetA :one\nselect 1;\nselect 2;",
			3,
			/without preceding annotation/,
		);
	});

	await t.test("rejects unknown commands", () => {
		rejects("-- name: GetA :batchexec\nselect 1;", 1, /unexpected command/);
	});

	await t.test("rejects empty queries", () => {
		rejects("-- name: GetA :one\n-- nothing\n;", 1, /is empty/);
	});

	await t.test("rejects column annotations without type", () => {
		rejects(
			"-- name: GetA :one\n-- column: a not null\nselect 1 a;",
			2,
			/without type/,
		);
	});

	await t.test("rejects unterminated quotes", () => {
		rejects("-- name: GetA :one\nselect\n'a;", 3, /unterminated/);
	});
});
