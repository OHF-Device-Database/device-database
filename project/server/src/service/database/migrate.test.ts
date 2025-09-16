import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";

import { test } from "tap";

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

test("sorting", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [
		migration2,
		migration3,
		migration1,
	];

	const plan = await migrate.plan(migrations);
	if (!DatabaseMigrate.viable(plan)) {
		throw Error("unreachable");
	}

	t.same(DatabaseMigrate.peek(plan), {
		kind: "initial",
		pending: [migration1, migration2, migration3],
	});
});

test("initial", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [migration1];

	{
		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.same(DatabaseMigrate.peek(plan), {
			kind: "initial",
			pending: migrations,
		});

		await migrate.act(plan);
	}

	{
		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.same(DatabaseMigrate.peek(plan), {
			kind: "inert",
		});
	}
});

test("subsequent", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	{
		const migrations: DatabaseMigrateMigration[] = [migration1];

		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		await migrate.act(plan);
	}

	{
		const migrations: DatabaseMigrateMigration[] = [migration1, migration2];

		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.same(DatabaseMigrate.peek(plan), {
			kind: "subsequent",
			pending: [migration2],
		});
	}
});

test("inert", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [];

	{
		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		await migrate.act(plan);
	}

	{
		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		t.same(DatabaseMigrate.peek(plan), {
			kind: "inert",
		});

		await migrate.act(plan);
	}
});

test("malformed migration", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [{ ...migration1, id: -1n }];

	const plan = await migrate.plan(migrations);
	t.same(plan, {
		kind: "malformed-migration",
		migration: migrations[0],
	});
});

test("duplicate identifier", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [
		migration1,
		{ ...migration2, id: 1n },
	];

	const plan = await migrate.plan(migrations);
	t.same(plan, {
		kind: "duplicate-identifier",
		migration: { ...migration2, id: 1n },
	});
});

test("table integrity", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migrations: DatabaseMigrateMigration[] = [migration1];

	{
		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		await migrate.act(plan);
	}

	{
		await db.exec(`update ${MIGRATION_TABLE_NAME} set id = -1;`);

		const plan = await migrate.plan(migrations);
		t.same(plan, {
			kind: "table-integrity-violation",
			found: { id: -1n, name: migration1.name, hash: migration1.hash },
		});
	}
});

test("unexpected migration", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	{
		const migrations: DatabaseMigrateMigration[] = [migration1];

		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw Error("unreachable");
		}

		await migrate.act(plan);
	}

	{
		const migrations: DatabaseMigrateMigration[] = [migration2];

		const plan = await migrate.plan(migrations);
		t.same(plan, {
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

test("invalid migration", async (t) => {
	const db = new Database(":memory:", false);

	const migrate = new DatabaseMigrate(db);

	const migration: DatabaseMigrateMigration = { ...migration1, content: "foo" };

	const migrations: DatabaseMigrateMigration[] = [migration];

	const plan = await migrate.plan(migrations);
	if (!DatabaseMigrate.viable(plan)) {
		throw Error("unreachable");
	}

	await t.rejects(
		migrate.act(plan),
		new DatabaseMigrateActError(migration, Error),
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

	test("migrations from file system", async (t) => {
		const { DatabaseMigrate } = await t.mockImport<
			typeof import("./migrate.js")
		>("./migrate.js", {
			"node:fs/promises": {
				glob: mockedGlob,
				readFile: (name: string) => {
					return Buffer.from(
						files[name as keyof typeof files].content,
						"utf-8",
					);
				},
			},
		});

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

		t.same(await unroll(DatabaseMigrate.migrations("./")), expected);
	});
}
