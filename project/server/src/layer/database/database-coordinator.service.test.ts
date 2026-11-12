import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { type TestContext, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import type { PickDeep } from "type-fest";

import { logger } from "../../logger";
import { DatabaseSwappable } from "../../service/database";
import { DatabaseDomain } from "../../service/database/domain";
import { ServiceDatabaseCoordinator } from "./database-coordinator.service";

import type { DatabaseName } from "../../service/database/base";
import type { Config } from "../config/config.module";
import type { Databases } from "./database.module";

logger.silent = true;

const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

/** migrations are planned but never applied, the tests lay out their own schema */
const config = { database: { migrate: false } } satisfies PickDeep<
	Config,
	"database.migrate"
>;

type Instance = DatabaseSwappable<DatabaseName>;

const read = (database: Instance, name = "main") =>
	[
		...database.raw.query(
			`select bar from ${name}.foo`,
			{ returnArray: true },
			{},
		),
	] as unknown as string[][];

/** waits for the coordinator to have reopened `db` through `name` */
const reopened = async (db: Instance, name: string, expected: string) => {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (db.raw.location(name) === expected) {
			return true;
		}

		await sleep(10);
	}

	return false;
};

/** provokes a watch event in the domain root without changing where `current` points */
const touch = async (domain: DatabaseDomain) => {
	const path = join(domain.root, "touched");
	await writeFile(path, "");
	await rm(path, { force: true });
};

test("database coordinator", async (t: TestContext) => {
	const fixture = async () => {
		const directory = await mkdtemp(
			join(baseDirectory, "device-database-testing-"),
		);

		const disposables: (() => Promise<void>)[] = [];

		return {
			directory,
			domain: (name: string) => new DatabaseDomain(join(directory, name)),
			/** closed in reverse order on disposal */
			onDispose: (dispose: () => Promise<void>) => {
				disposables.unshift(dispose);
			},
			[Symbol.asyncDispose]: async () => {
				for (const dispose of disposables) {
					await dispose();
				}

				await rm(directory, { recursive: true, force: true });
			},
		};
	};

	/** brings a coordinator up against `databases`, counting the reopens it asks for */
	const coordinate = async (
		f: Awaited<ReturnType<typeof fixture>>,
		...databases: Instance[]
	) => {
		const reopens = { count: 0 };

		const counted = databases.map(
			(database) =>
				new Proxy(database, {
					get(target, property) {
						if (property === "respawn") {
							return async () => {
								reopens.count += 1;
								await target.respawn();
							};
						}

						const value = Reflect.get(target, property);
						return typeof value === "function" ? value.bind(target) : value;
					},
				}),
		);

		const coordinator = new ServiceDatabaseCoordinator(
			config,
			counted satisfies Databases,
		);
		f.onDispose(() => coordinator.onApplicationShutdown());

		await coordinator.onModuleInit();

		// a platform watch only starts reporting once it has actually been scheduled, and bringing
		// a second one up re-schedules the first — swapping before that settles would race the very
		// event being waited on
		await sleep(250);

		return reopens;
	};

	await t.test(
		"reopens when another instance swapped a generation in",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = f.domain("staging");

			// the instance that performs the swap
			const leader = new DatabaseSwappable("staging", domain, {});
			f.onDispose(async () => {
				await leader.despawn();
				leader.raw.close();
			});
			leader.raw.exec("create table foo (bar text not null) strict");
			leader.raw.exec("insert into foo values ('old')");

			// a second instance against the same layout, as a rollout runs them side by side
			const follower = new DatabaseSwappable("staging", domain, {});
			f.onDispose(async () => {
				follower.raw.close();
			});

			await coordinate(f, follower);

			t.assert.deepStrictEqual(read(follower), [["old"]]);

			const generation = await leader.copy();
			generation.raw.exec("update foo set bar = 'new'");
			await leader.swap(generation);

			const resolved = domain.resolved;
			t.assert.ok(typeof resolved !== "undefined");
			t.assert.ok(
				await reopened(follower, "main", resolved),
				"follower should have reopened through the link",
			);
			t.assert.deepStrictEqual(read(follower), [["new"]]);
		},
	);

	await t.test("follows consecutive swaps", async (t: TestContext) => {
		await using f = await fixture();
		const domain = f.domain("staging");

		const leader = new DatabaseSwappable("staging", domain, {});
		f.onDispose(async () => {
			await leader.despawn();
			leader.raw.close();
		});
		leader.raw.exec("create table foo (bar text not null) strict");
		leader.raw.exec("insert into foo values ('old')");

		const follower = new DatabaseSwappable("staging", domain, {});
		f.onDispose(async () => {
			follower.raw.close();
		});

		await coordinate(f, follower);

		// the second reopen runs against a connection a reopen has already moved once, which
		// is the state a rollout leaves every follower in
		for (const value of ["first", "second"]) {
			const generation = await leader.copy();
			generation.raw.exec(`update foo set bar = '${value}'`);
			await leader.swap(generation);

			const resolved = domain.resolved;
			t.assert.ok(typeof resolved !== "undefined");
			t.assert.ok(
				await reopened(follower, "main", resolved),
				`follower should have reopened on <${value}>`,
			);
			t.assert.deepStrictEqual(read(follower), [[value]]);
		}
	});

	await t.test(
		"leaves an instance that already holds the live generation alone",
		async (t: TestContext) => {
			await using f = await fixture();
			const domain = f.domain("staging");

			const leader = new DatabaseSwappable("staging", domain, {});
			f.onDispose(async () => {
				await leader.despawn();
				leader.raw.close();
			});
			leader.raw.exec("create table foo (bar text not null) strict");
			leader.raw.exec("insert into foo values ('old')");

			const reopens = await coordinate(f, leader);

			// swapping reopens as part of itself, so the link resolves to what is already held open
			const generation = await leader.copy();
			generation.raw.exec("update foo set bar = 'new'");
			await leader.swap(generation);

			const resolved = domain.resolved;
			t.assert.ok(typeof resolved !== "undefined");
			t.assert.strictEqual(leader.raw.location(), resolved);

			// the rename may well have been reported while the swap was still reopening, which
			// collapses into that reopen rather than adding one — only the settled layout is asserted
			reopens.count = 0;

			await touch(domain);
			await sleep(100);

			t.assert.strictEqual(reopens.count, 0);
			t.assert.deepStrictEqual(read(leader), [["new"]]);
		},
	);

	await t.test(
		"reopens when an attached database was swapped",
		async (t: TestContext) => {
			await using f = await fixture();
			const staging = f.domain("staging");
			const derived = f.domain("derived");

			const leader = new DatabaseSwappable("staging", staging, {});
			f.onDispose(async () => {
				await leader.despawn();
				leader.raw.close();
			});
			leader.raw.exec("create table foo (bar text not null) strict");
			leader.raw.exec("insert into foo values ('old')");

			// reaches staging through its domain, so it follows whatever is swapped in under it
			const follower = new DatabaseSwappable("derived", derived, { staging });
			f.onDispose(async () => {
				follower.raw.close();
			});

			await coordinate(f, follower);

			t.assert.deepStrictEqual(read(follower, "staging"), [["old"]]);

			const generation = await leader.copy();
			generation.raw.exec("update foo set bar = 'new'");
			await leader.swap(generation);

			const resolved = staging.resolved;
			t.assert.ok(typeof resolved !== "undefined");
			t.assert.ok(
				await reopened(follower, "staging", resolved),
				"follower should have reopened its attachment",
			);
			t.assert.deepStrictEqual(read(follower, "staging"), [["new"]]);
		},
	);
});
