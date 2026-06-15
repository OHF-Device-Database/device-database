import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { type TestContext, test } from "node:test";

import { logger } from "../../../logger";
import { unroll } from "../../../utility/iterable";
import { Database } from "..";
import {
	DatabaseMigrate,
	DatabaseMigrateActError,
	type DatabaseMigrateMigration,
	MIGRATION_TABLE_NAME,
	parseMigration,
} from "../migrate";

const migration1: DatabaseMigrateMigration = {
	id: 1n,
	name: "foo",
	hash: "h1",
	content: "create table foo (bar text not null) strict;",
};

const migration2: DatabaseMigrateMigration = {
	id: 2n,
	name: "bar",
	hash: "h2",
	content: "alter table foo add column baz integer;",
};

const migration3: DatabaseMigrateMigration = {
	id: 3n,
	name: "baz",
	hash: "h3",
	content: "alter table foo add column qux integer;",
};

const buildDatabase = () => {
	return new Database(undefined, ":memory:", {});
};

test("sorting", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [
		migration2,
		migration3,
		migration1,
	];

	const plan = migrate.plan(migrations);
	if (!DatabaseMigrate.viable(plan)) {
		throw Error("unreachable");
	}

	t.assert.deepStrictEqual(DatabaseMigrate.peek(plan), {
		kind: "initial",
		pending: [migration1, migration2, migration3],
	});
});

test("initial", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [migration1];

	{
		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.deepStrictEqual(DatabaseMigrate.peek(plan), {
			kind: "initial",
			pending: migrations,
		});

		migrate.act(plan);
	}

	{
		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.deepStrictEqual(DatabaseMigrate.peek(plan), {
			kind: "inert",
		});
	}
});

test("subsequent", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	{
		const migrations: DatabaseMigrateMigration[] = [migration1];

		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);
	}

	{
		const migrations: DatabaseMigrateMigration[] = [migration1, migration2];

		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.deepStrictEqual(DatabaseMigrate.peek(plan), {
			kind: "subsequent",
			pending: [migration2],
		});
	}
});

test("inert", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [];

	{
		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);
	}

	{
		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.deepStrictEqual(DatabaseMigrate.peek(plan), {
			kind: "inert",
		});

		migrate.act(plan);
	}
});

test("malformed migration", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [{ ...migration1, id: -1n }];

	const plan = migrate.plan(migrations);
	t.assert.deepStrictEqual(plan, {
		kind: "malformed-migration",
		migration: migrations[0],
	});
});

test("duplicate identifier", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [
		migration1,
		{ ...migration2, id: 1n },
	];

	const plan = migrate.plan(migrations);
	t.assert.deepStrictEqual(plan, {
		kind: "duplicate-identifier",
		migration: { ...migration2, id: 1n },
	});
});

test("table integrity", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [migration1];

	{
		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);
	}

	{
		db.raw.exec(`update ${MIGRATION_TABLE_NAME} set id = -1;`);

		const plan = migrate.plan(migrations);
		t.assert.partialDeepStrictEqual(plan, {
			kind: "table-integrity-violation",
			found: { id: -1n, name: migration1.name, hash: migration1.hash },
		});
	}
});

test("unexpected migration", (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	{
		const migrations: DatabaseMigrateMigration[] = [migration1];

		const plan = migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);
	}

	{
		const migrations: DatabaseMigrateMigration[] = [migration2];

		const plan = migrate.plan(migrations);
		t.assert.partialDeepStrictEqual(plan, {
			kind: "unexpected-migration",
			expected: {
				id: migration1.id,
				name: migration1.name,
				hash: migration1.hash,
			},
			received: migration2,
		});
	}
});

test("invalid migration", async (t: TestContext) => {
	const db = buildDatabase();

	const migrate = new DatabaseMigrate(db);

	const migration: DatabaseMigrateMigration = { ...migration1, content: "foo" };

	const migrations: DatabaseMigrateMigration[] = [migration];

	const plan = migrate.plan(migrations);
	if (!DatabaseMigrate.viable(plan)) {
		throw Error("unreachable");
	}

	t.assert.throws(
		() => migrate.act(plan),
		(e) => {
			return e instanceof DatabaseMigrateActError;
		},
	);
});

test("migration parsing", (t: TestContext) => {
	t.test("no preflight / postflight", (t: TestContext) => {
		const content = "create table foo (bar text not null) strict;";
		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "success",
			migration: {
				preflight: null,
				body: content,
				postflight: null,
			},
		});
	});

	t.test("preflight only", (t: TestContext) => {
		const content = [
			"-- preflight:begin",
			"pragma foreign_keys = off;",
			"-- preflight:end",
			"create table foo (bar text not null) strict;",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "success",
			migration: {
				preflight: "pragma foreign_keys = off;",
				body: "create table foo (bar text not null) strict;",
				postflight: null,
			},
		});
	});

	t.test("postflight only", (t: TestContext) => {
		const content = [
			"create table foo (bar text not null) strict;",
			"-- postflight:begin",
			"pragma foreign_keys = on;",
			"-- postflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "success",
			migration: {
				preflight: null,
				body: "create table foo (bar text not null) strict;",
				postflight: "pragma foreign_keys = on;",
			},
		});
	});

	t.test("preflight and postflight", (t: TestContext) => {
		const content = [
			"-- preflight:begin",
			"pragma foreign_keys = off;",
			"-- preflight:end",
			"create table foo (bar text not null) strict;",
			"-- postflight:begin",
			"pragma foreign_keys = on;",
			"-- postflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "success",
			migration: {
				preflight: "pragma foreign_keys = off;",
				body: "create table foo (bar text not null) strict;",
				postflight: "pragma foreign_keys = on;",
			},
		});
	});

	t.test("duplicate marker", (t: TestContext) => {
		const content = [
			"-- preflight:begin",
			"pragma foreign_keys = off;",
			"-- preflight:begin",
			"-- preflight:end",
			"create table foo (bar text not null) strict;",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "duplicate-marker",
			line: 3,
		});
	});

	t.test("nested postflight in preflight", (t: TestContext) => {
		const content = [
			"-- preflight:begin",
			"-- postflight:begin",
			"-- preflight:end",
			"create table foo (bar text not null) strict;",
			"-- postflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "nested-marker",
			line: 2,
		});
	});

	t.test("nested preflight in postflight", (t: TestContext) => {
		const content = [
			"create table foo (bar text not null) strict;",
			"-- postflight:begin",
			"-- preflight:begin",
			"-- postflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "nested-marker",
			line: 3,
		});
	});

	t.test("unpaired begin marker", (t: TestContext) => {
		const content = [
			"-- preflight:begin",
			"pragma foreign_keys = off;",
			"create table foo (bar text not null) strict;",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "unpaired-marker",
			line: 1,
		});
	});

	t.test("unpaired end marker", (t: TestContext) => {
		const content = [
			"create table foo (bar text not null) strict;",
			"-- postflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "unpaired-marker",
			line: 2,
		});
	});

	t.test("preflight not at start", (t: TestContext) => {
		const content = [
			"create table foo (bar text not null) strict;",
			"-- preflight:begin",
			"pragma foreign_keys = off;",
			"-- preflight:end",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "preflight-not-at-start",
			line: 2,
		});
	});

	t.test("postflight not at end", (t: TestContext) => {
		const content = [
			"-- postflight:begin",
			"pragma foreign_keys = on;",
			"-- postflight:end",
			"create table foo (bar text not null) strict;",
		].join("\n");

		const result = parseMigration(content);

		t.assert.deepStrictEqual(result, {
			kind: "error",
			error: "postflight-not-at-end",
			line: 3,
		});
	});
});

test("act", (t: TestContext) => {
	t.test("preflight executes before transaction", (t: TestContext) => {
		const db = buildDatabase();
		const migrate = new DatabaseMigrate(db);

		const migration: DatabaseMigrateMigration = {
			id: 1n,
			name: "preflight-test",
			hash: "h1",
			content: [
				"-- preflight:begin",
				"create table preflight_marker (v integer not null) strict;",
				"insert into preflight_marker values (1);",
				"-- preflight:end",
				"create table foo (bar text not null) strict;",
			].join("\n"),
		};

		const plan = migrate.plan([migration]);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);

		// preflight-created table should exist
		const rows = [
			...db.raw.query(
				"select v from preflight_marker",
				{ returnArray: true },
				{},
			),
		];
		t.assert.deepStrictEqual(rows, [[1]]);

		// body-created table should also exist
		const tables = [
			...db.raw.query(
				"select name from sqlite_master where type = 'table' and name = 'foo'",
				{ returnArray: true },
				{},
			),
		];
		t.assert.deepStrictEqual(tables, [["foo"]]);
	});

	t.test("postflight executes after transaction", (t: TestContext) => {
		const db = buildDatabase();
		const migrate = new DatabaseMigrate(db);

		const migration: DatabaseMigrateMigration = {
			id: 1n,
			name: "postflight-test",
			hash: "h1",
			content: [
				"create table foo (bar text not null) strict;",
				"-- postflight:begin",
				"create table postflight_marker (v integer not null) strict;",
				"insert into postflight_marker values (42);",
				"-- postflight:end",
			].join("\n"),
		};

		const plan = migrate.plan([migration]);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);

		// postflight-created table should exist
		const rows = [
			...db.raw.query(
				"select v from postflight_marker",
				{ returnArray: true },
				{},
			),
		];
		t.assert.deepStrictEqual(rows, [[42]]);
	});

	t.test("preflight and postflight with pragma", (t: TestContext) => {
		const db = buildDatabase();
		const migrate = new DatabaseMigrate(db);

		const migration: DatabaseMigrateMigration = {
			id: 1n,
			name: "pragma-test",
			hash: "h1",
			content: [
				"-- preflight:begin",
				"pragma foreign_keys = off;",
				"-- preflight:end",
				"create table foo (bar text not null) strict;",
				"-- postflight:begin",
				"pragma foreign_keys = on;",
				"-- postflight:end",
			].join("\n"),
		};

		const plan = migrate.plan([migration]);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		migrate.act(plan);

		// foreign_keys should be restored to ON
		const rows = [
			...db.raw.query("pragma foreign_keys", { returnArray: true }, {}),
		];
		t.assert.deepStrictEqual(rows, [[1]]);
	});

	t.test("error in preflight throws", (t: TestContext) => {
		const db = buildDatabase();
		const migrate = new DatabaseMigrate(db);

		const migration: DatabaseMigrateMigration = {
			id: 1n,
			name: "bad-preflight",
			hash: "h1",
			content: [
				"-- preflight:begin",
				"invalid sql garbage;",
				"-- preflight:end",
				"create table foo (bar text not null) strict;",
			].join("\n"),
		};

		const plan = migrate.plan([migration]);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.throws(
			() => migrate.act(plan),
			(e) => e instanceof DatabaseMigrateActError,
		);
	});

	t.test("error in postflight throws", (t: TestContext) => {
		const db = buildDatabase();
		const migrate = new DatabaseMigrate(db);

		const migration: DatabaseMigrateMigration = {
			id: 1n,
			name: "bad-postflight",
			hash: "h1",
			content: [
				"create table foo (bar text not null) strict;",
				"-- postflight:begin",
				"invalid sql garbage;",
				"-- postflight:end",
			].join("\n"),
		};

		const plan = migrate.plan([migration]);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.assert.throws(
			() => migrate.act(plan),
			(e) => e instanceof DatabaseMigrateActError,
		);
	});

	{
		logger.level = "error";

		const files = {
			"1_foo.sql": { id: 1n, content: "create table foo (bar text not null);" },
			"2_bar.sql": { id: 2n, content: "create table bar (baz text not null);" },
		} as const;

		const fileNames = Object.keys(files);

		async function* mockedGlob() {
			const dirent = (
				name: string,
				parentPath: string,
				kind:
					| "file"
					| "symbolic-link"
					| "directory"
					| "block-device"
					| "character-device"
					| "fifo"
					| "socket",
			): Dirent<string> => {
				return {
					isFile: () => kind === "file",
					isSymbolicLink: () => kind === "symbolic-link",
					isDirectory: () => kind === "directory",
					isBlockDevice: () => kind === "block-device",
					isCharacterDevice: () => kind === "character-device",
					isFIFO: () => kind === "fifo",
					isSocket: () => kind === "socket",
					name,
					parentPath,
				};
			};

			yield dirent(fileNames[0], "", "file");
			yield dirent(fileNames[1], "", "symbolic-link");
			yield dirent("foo.sql", "", "file");
			yield dirent("3.sql", "", "directory");
		}

		test("migrations from file system", async (t: TestContext) => {
			t.mock.module("node:fs/promises", {
				namedExports: {
					glob: t.mock.fn(mockedGlob),
					readFile: t.mock.fn((name: string) => {
						return Buffer.from(
							files[name as keyof typeof files].content,
							"utf-8",
						);
					}),
				},
			});

			// otherwise the cached module from the import at the top is used
			// @ts-expect-error
			const { DatabaseMigrate } = await import("./index.js?foo");

			const expected = Object.entries(files).map(([name, { id, content }]) => {
				const hasher = createHash("sha256");
				hasher.update(content);

				return {
					id,
					name,
					hash: hasher.digest("hex"),
					content,
				};
			});

			t.assert.deepStrictEqual(
				await unroll(DatabaseMigrate.migrations("./")),
				expected,
			);
		});
	}
});
