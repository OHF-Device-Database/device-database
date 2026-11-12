import { randomUUID } from "node:crypto";
import { lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";

import { logger } from "../../logger";
import { bake, peek as peekDescriptor } from "./base";
import {
	DatabaseDomain,
	DatabaseDomainCurrentNotLinkError,
	peek as peekGeneration,
} from "./domain";

logger.silent = true;

const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

const fixture = async () => {
	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-"),
	);

	return {
		root: join(directory, "staging"),
		[Symbol.asyncDispose]: async () => {
			await rm(directory, { recursive: true, force: true });
		},
	};
};

/** writes a self-contained database holding a single value */
const persist = (location: string, value: string) => {
	const db = new DatabaseSync(new URL(peekDescriptor(bake({ location }))));
	db.exec("create table foo (bar text not null) strict");
	db.exec(`insert into foo values ('${value}')`);
	db.close();
};

const read = (location: string) => {
	const db = new DatabaseSync(new URL(peekDescriptor(bake({ location }))));
	try {
		const prepared = db.prepare("select bar from foo");
		prepared.setReturnArrays(true);
		return [...prepared.all({})] as unknown as string[][];
	} finally {
		db.close();
	}
};

test("domain bootstrap", async (t: TestContext) => {
	await t.test("seeds an empty root", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		const live = peekGeneration(domain.bootstrap());

		t.assert.strictEqual(live.target, "initial");
		t.assert.strictEqual(
			domain.current && peekGeneration(domain.current).target,
			"initial",
		);
		t.assert.ok(lstatSync(join(f.root, "current")).isSymbolicLink());
		// the database was created through `initial` rather than through the link
		t.assert.ok(lstatSync(join(f.root, "initial", "db")).isFile());
		// `clone` and `orphaned` depend on it
		t.assert.ok(lstatSync(join(f.root, "generation")).isDirectory());

		// nothing stayed pinned to the file that was created, it is reachable through `current`
		persist(live.location, "value");
		t.assert.deepStrictEqual(read(join(f.root, "initial", "db")), [["value"]]);
	});

	await t.test("adopts an existing initial", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		await mkdir(join(f.root, "initial"), { recursive: true });
		persist(join(f.root, "initial", "db"), "adopted");

		const live = peekGeneration(domain.bootstrap());

		t.assert.deepStrictEqual(read(live.location), [["adopted"]]);
	});

	await t.test(
		"follows a symlinked database within initial",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = new DatabaseDomain(f.root);

			// how a database that predates the layout is adopted without moving it
			const elsewhere = join(f.root, "..", "legacy.db");
			persist(elsewhere, "legacy");

			await mkdir(join(f.root, "initial"), { recursive: true });
			symlinkSync(join("..", "..", "legacy.db"), join(f.root, "initial", "db"));

			const live = peekGeneration(domain.bootstrap());

			// `current` -> `initial` -> `../../legacy.db`, resolved in one go at open time
			t.assert.deepStrictEqual(read(live.location), [["legacy"]]);
			// the link was adopted rather than replaced by a fresh database
			t.assert.ok(
				lstatSync(join(f.root, "initial", "db")).isSymbolicLink(),
				"initial/db should still be a symlink",
			);
		},
	);

	await t.test("leaves an existing current alone", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		domain.bootstrap();

		const generation = await domain.clone("fixed");
		const cloned = peekGeneration(generation);
		persist(cloned.location, "generated");
		domain.point(generation);

		const live = peekGeneration(domain.bootstrap());

		t.assert.strictEqual(live.target, cloned.target);
		t.assert.deepStrictEqual(read(live.location), [["generated"]]);
	});

	await t.test(
		"rejects a current that is not a link",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = new DatabaseDomain(f.root);

			await mkdir(join(f.root, "current"), { recursive: true });

			t.assert.throws(
				() => domain.bootstrap(),
				DatabaseDomainCurrentNotLinkError,
			);
		},
	);
});

test("domain read-only", async (t: TestContext) => {
	await using f = await fixture();
	const domain = new DatabaseDomain(f.root, true);

	// the layout is still laid out, only what reaches through it is held back
	const live = peekGeneration(domain.bootstrap());
	t.assert.ok(lstatSync(join(f.root, "initial", "db")).isFile());

	persist(join(f.root, "initial", "db"), "value");

	const db = new DatabaseSync(new URL(peekDescriptor(live.descriptor)));
	try {
		const prepared = db.prepare("select bar from foo");
		prepared.setReturnArrays(true);
		t.assert.deepStrictEqual([...prepared.all({})], [["value"]]);

		t.assert.throws(() => db.exec("insert into foo values ('written')"));
	} finally {
		db.close();
	}
});

test("domain point", async (t: TestContext) => {
	await t.test("returns the previous generation", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		domain.bootstrap();

		const generation = await domain.clone("a");

		const previous = domain.point(generation);
		t.assert.strictEqual(
			previous && peekGeneration(previous).target,
			"initial",
		);
		t.assert.strictEqual(
			domain.current && peekGeneration(domain.current).target,
			join("generation", "a"),
		);
	});

	await t.test("keeps the target relative", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		domain.bootstrap();

		// an absolute target would break as soon as the tree is mounted elsewhere
		t.assert.strictEqual(readlinkSync(join(f.root, "current")), "initial");
	});

	await t.test("leaves no staged links behind", async (t: TestContext) => {
		await using f = await fixture();
		const domain = new DatabaseDomain(f.root);

		domain.bootstrap();
		domain.point(await domain.clone("a"));

		const entries = await readdir(f.root);
		t.assert.deepStrictEqual(entries.toSorted(), [
			"current",
			"generation",
			"initial",
		]);
	});
});

test("domain clone", async (t: TestContext) => {
	await t.test(
		"copies the live database into a generation",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = new DatabaseDomain(f.root);

			const live = peekGeneration(domain.bootstrap());
			persist(live.location, "value");

			const generation = peekGeneration(await domain.clone());

			t.assert.deepStrictEqual(read(generation.location), [["value"]]);

			// a copy rather than a second link to the same file
			const db = new DatabaseSync(
				new URL(peekDescriptor(bake({ location: generation.location }))),
			);
			db.exec("update foo set bar = 'replaced'");
			db.close();

			t.assert.deepStrictEqual(read(live.location), [["value"]]);
		},
	);

	await t.test(
		"carries an uncheckpointed write-ahead log",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = new DatabaseDomain(f.root);

			const live = peekGeneration(domain.bootstrap());

			// stays open, so the log is never checkpointed into the database file
			const db = new DatabaseSync(
				new URL(peekDescriptor(bake({ location: live.location }))),
			);
			db.exec("pragma journal_mode = wal");
			db.exec("create table foo (bar text not null) strict");
			db.exec("insert into foo values ('logged')");

			const generation = peekGeneration(await domain.clone());

			db.close();

			t.assert.ok(lstatSync(`${generation.location}-wal`).isFile());
			// the shared-memory index is left behind, SQLite rebuilds it from the log
			t.assert.strictEqual(
				lstatSync(`${generation.location}-shm`, { throwIfNoEntry: false }),
				undefined,
			);

			t.assert.deepStrictEqual(read(generation.location), [["logged"]]);
		},
	);
});

test("domain orphaned", async (t: TestContext) => {
	await using f = await fixture();
	const domain = new DatabaseDomain(f.root);

	domain.bootstrap();

	t.assert.deepStrictEqual(await domain.orphaned(), []);

	const live = await domain.clone();
	const stale = await domain.clone();
	domain.point(live);

	t.assert.deepStrictEqual(
		(await domain.orphaned()).map(
			(generation) => peekGeneration(generation).target,
		),
		[peekGeneration(stale).target],
	);

	await domain.discard(stale);

	t.assert.deepStrictEqual(await domain.orphaned(), []);
});

test("domain discard", async (t: TestContext) => {
	await using f = await fixture();
	const domain = new DatabaseDomain(f.root);

	domain.bootstrap();

	const generation = await domain.clone(randomUUID());
	const { location, path } = peekGeneration(generation);
	// a generation holds the sidecars of its own database, removing the directory takes them along
	await writeFile(`${location}-wal`, "");

	await domain.discard(generation);

	t.assert.strictEqual(lstatSync(path, { throwIfNoEntry: false }), undefined);

	// tolerates a generation that is already gone
	await domain.discard(generation);
});
