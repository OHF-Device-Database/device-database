import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { unroll } from "../../utility/iterable";
import { Database } from ".";
import {
	DatabaseMigrate,
	DatabaseMigrateActError,
	type DatabaseMigrateMigration,
	MIGRATION_TABLE_NAME,
} from "./migrate";

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

test("sorting", (t: TestContext) => {
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [{ ...migration1, id: -1n }];

	const plan = migrate.plan(migrations);
	t.assert.deepStrictEqual(plan, {
		kind: "malformed-migration",
		migration: migrations[0],
	});
});

test("duplicate identifier", (t: TestContext) => {
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
	const db = new Database(":memory:", false, false);

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
		const { DatabaseMigrate } = await import("./migrate.js?foo");

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
