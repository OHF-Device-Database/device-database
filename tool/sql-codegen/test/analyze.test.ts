import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { AnalyzeError, Analyzer, valueTypeOf } from "../src/analyze.ts";
import { parseSource } from "../src/source.ts";

const schema = `
create table parent (
    id integer primary key,
    name text not null,
    note varchar(10),
    data blob,
    score real,
    amount decimal(10, 2),
    anything
);

create table child (
    id text primary key,
    parent_id integer not null references parent (id)
) without rowid;

create table strict_child (
    id text primary key,
    value any
) strict;

create table loose (
    id text primary key
);
`;

const setup = () => {
	const db = new DatabaseSync(":memory:");
	db.exec(schema);
	return db;
};

const analyze = (db: DatabaseSync, source: string) => {
	const analyzer = new Analyzer(db);
	return parseSource(source).map((query) => analyzer.analyze(query));
};

const analyzeOne = (db: DatabaseSync, source: string) => {
	const [query] = analyze(db, source);
	assert.ok(typeof query !== "undefined");
	return query;
};

const columnsOf = (db: DatabaseSync, source: string) =>
	Object.fromEntries(
		analyzeOne(db, source).columns.map((c) => [
			c.name,
			{ type: c.type, nullable: c.nullable },
		]),
	);

const rejects = (db: DatabaseSync, source: string, message: RegExp) => {
	assert.throws(
		() => analyze(db, source),
		(e: unknown) => {
			assert.ok(e instanceof AnalyzeError);
			assert.match(e.message, message);
			return true;
		},
	);
};

test("valueTypeOf follows affinity rules", () => {
	assert.deepEqual(
		[
			"INTEGER",
			"tinyint",
			"BIGINT",
			"varchar(255)",
			"CLOB",
			"text",
			"blob",
			"",
			"any",
			"real",
			"double precision",
			"float",
			"decimal(10, 2)",
			"boolean",
			"date",
			// "INT" takes precedence over "CHAR" (rule order)
			"CHARINT",
		].map(valueTypeOf),
		[
			"integer",
			"integer",
			"integer",
			"text",
			"text",
			"text",
			"blob",
			"any",
			"any",
			"real",
			"real",
			"real",
			"numeric",
			"numeric",
			"numeric",
			"integer",
		],
	);
});

test("Analyzer", async (t) => {
	await t.test("infers types and nullability from table columns", () => {
		const db = setup();

		assert.deepEqual(
			columnsOf(
				db,
				`-- name: GetParent :one
				select id, name, note, data, score, amount, anything from parent`,
			),
			{
				id: { type: "integer", nullable: false },
				name: { type: "text", nullable: false },
				note: { type: "text", nullable: true },
				data: { type: "blob", nullable: true },
				score: { type: "real", nullable: true },
				amount: { type: "numeric", nullable: true },
				anything: { type: "any", nullable: true },
			},
		);
	});

	await t.test("treats primary keys according to table kind", () => {
		const db = setup();

		assert.deepEqual(
			columnsOf(
				db,
				`-- name: GetIds :one
				select c.id c, s.id s, l.id l from child c, strict_child s, loose l`,
			),
			{
				// "without rowid" and strict tables enforce non-null primary keys
				c: { type: "text", nullable: false },
				s: { type: "text", nullable: false },
				// rowid tables permit null in non-integer primary keys
				l: { type: "text", nullable: true },
			},
		);
	});

	await t.test("aliases keep their origin", () => {
		const db = setup();

		const [column] = analyzeOne(
			db,
			`-- name: GetParent :one
			select name "parentName" from (select name from parent)`,
		).columns;

		assert.deepEqual(column, {
			name: "parentName",
			type: "text",
			nullable: false,
			origin: { database: "main", table: "parent", column: "name" },
			annotated: false,
		});
	});

	await t.test("expressions are untyped and nullable", () => {
		const db = setup();

		assert.deepEqual(
			columnsOf(
				db,
				`-- name: GetCount :one
				select count(*) count, cast(1 as integer) one from parent`,
			),
			{
				count: { type: undefined, nullable: true },
				one: { type: undefined, nullable: true },
			},
		);
	});

	await t.test("outer joins make every column nullable", () => {
		const db = setup();

		for (const join of [
			"left join",
			"left outer join",
			"full join",
			"right join",
		]) {
			const columns = columnsOf(
				db,
				`-- name: GetJoined :many
				select p.id, c.id child_id from parent p ${join} child c on (c.parent_id = p.id)`,
			);
			assert.deepEqual(
				columns,
				{
					id: { type: "integer", nullable: true },
					child_id: { type: "text", nullable: true },
				},
				join,
			);
		}

		// inner joins and look-alikes don't
		assert.deepEqual(
			columnsOf(
				db,
				`-- name: GetJoined :many
				select p.id, 'left join' "left" from parent p join child c on (c.parent_id = p.id)`,
			).id,
			{ type: "integer", nullable: false },
		);
	});

	await t.test("annotations override types and nullability", () => {
		const db = setup();

		const columns = analyzeOne(
			db,
			`-- name: GetCount :one
			-- column: count integer not null
			-- column: note text
			select count(*) count, max(note) note from parent`,
		).columns;

		assert.deepEqual(
			columns.map((c) => [c.name, c.type, c.nullable, c.annotated]),
			[
				["count", "integer", false, true],
				["note", "text", true, true],
			],
		);
	});

	await t.test("resolves attached databases", () => {
		const db = setup();
		db.exec(`attach ':memory:' as other`);
		db.exec(
			`create table other.remote (id integer primary key, label text not null)`,
		);

		const query = analyzeOne(
			db,
			`-- name: GetRemote :many
			select r.id, r.label, p.name from remote r join parent p on (p.id = r.id)`,
		);

		assert.deepEqual(
			query.columns.map((c) => [c.name, c.origin?.database, c.nullable]),
			[
				["id", "other", false],
				["label", "other", false],
				["name", "main", false],
			],
		);
	});

	await t.test("derives connection mode from name", () => {
		const db = setup();

		const queries = analyze(
			db,
			`-- name: GetParent :many
			select id from parent;
			-- name: InsertParent :exec
			insert into parent (name) values (@name);
			-- name: UpdateParent :exec
			update parent set name = @name;
			-- name: UpsertParent :one
			insert into parent (id, name) values (@id, @name) on conflict do update set name = excluded.name returning id;
			-- name: DeleteParent :exec
			delete from parent`,
		);

		assert.deepEqual(
			queries.map((q) => [q.name, q.connectionMode]),
			[
				["GetParent", "r"],
				["InsertParent", "w"],
				["UpdateParent", "w"],
				["UpsertParent", "w"],
				["DeleteParent", "w"],
			],
		);
	});

	await t.test("rejects malformed names", () => {
		const db = setup();

		rejects(db, "-- name: getParent :one\nselect 1 a", /malformed name/);
		rejects(
			db,
			"-- name: FetchParent :one\nselect 1 a",
			/unexpected name prefix <Fetch>/,
		);
	});

	await t.test("rejects writing queries named as reading", () => {
		const db = setup();

		rejects(
			db,
			"-- name: GetInserted :one\ninsert into parent (name) values ('a') returning id",
			/named as reading query, but writes/,
		);
		rejects(
			db,
			"-- name: GetDeleted :exec\nwith d as (select 1) delete from parent",
			/named as reading query, but writes/,
		);
	});

	await t.test("restores authorizer after preparing", () => {
		const db = setup();

		rejects(db, "-- name: GetInserted :exec\ndelete from parent", /writes/);
		rejects(
			db,
			"-- name: GetMissing :one\nselect * from missing",
			/preparation failed/,
		);

		// a lingering authorizer would deny or observe this
		db.prepare("insert into parent (name) values ('a')").run();
		assert.deepEqual(
			{ ...db.prepare("select count(*) count from parent").get() },
			{ count: 1 },
		);
	});

	await t.test("rejects result commands without columns", () => {
		const db = setup();

		rejects(
			db,
			"-- name: DeleteParent :one\ndelete from parent",
			/doesn't return any columns/,
		);
	});

	await t.test("rejects duplicate column names", () => {
		const db = setup();

		rejects(
			db,
			"-- name: GetParent :one\nselect p.id, c.id from parent p, child c",
			/duplicate column name <id>/,
		);
	});

	await t.test("rejects invalid annotations", () => {
		const db = setup();

		rejects(
			db,
			"-- name: GetCount :one\n-- column: total integer\nselect count(*) count from parent",
			/annotated column <total> isn't returned/,
		);
		rejects(
			db,
			"-- name: GetCount :one\n-- column: count integer\n-- column: count text\nselect count(*) count from parent",
			/annotated more than once/,
		);
	});

	await t.test("rejects statements sqlite can't prepare", () => {
		const db = setup();

		rejects(
			db,
			"-- name: GetMissing :one\nselect missing from parent",
			/preparation failed \(no such column: missing\)/,
		);
	});
});
