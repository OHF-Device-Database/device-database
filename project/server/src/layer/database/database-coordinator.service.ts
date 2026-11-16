import { randomUUID } from "node:crypto";
import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
	Inject,
	Injectable,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { logger as parentLogger } from "../../logger";
import {
	DatabaseDomainGenerationDiscardedError,
	peek,
} from "../../service/database/domain";
import {
	DatabaseMigrate,
	type DatabaseMigratePlanUnachievable,
} from "../../service/database/migrate";
import { isNone } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import { Config } from "../config/config.module";
import { Databases } from "./database.module";

import type { IDatabase, IDatabaseSwappable } from "../../service/database";
import type { DatabaseName } from "../../service/database/base";
import type { DatabaseDomain } from "../../service/database/domain";

const logger = parentLogger.child({ label: "database-coordinator" });

/** probes a freshly brought up watch this often until it reports */
const probeEvery = 250;
/** gives up on a watch that has not reported within this */
const probeWithin = 5_000;

export class DatabaseMigrationPlanUnachievableError extends Error {
	constructor(
		public database: DatabaseName,
		public plan: DatabaseMigratePlanUnachievable,
	) {
		super(`migration plan for <${database}> unachievable`);
		Object.setPrototypeOf(
			this,
			DatabaseMigrationPlanUnachievableError.prototype,
		);
	}
}

export class DatabaseWatchInertError extends Error {
	constructor(public root: string) {
		super(`watch on <${root}> does not report`);
		Object.setPrototypeOf(this, DatabaseWatchInertError.prototype);
	}
}

@Injectable()
export class ServiceDatabaseCoordinator
	implements OnModuleInit, OnApplicationShutdown
{
	private readonly watchers: FSWatcher[] = [];

	constructor(
		@Inject(Config)
		private readonly config: PickDeep<Config, "database.migrate">,
		@Inject(Databases) private readonly databases: Databases,
	) {}

	async onModuleInit(): Promise<void> {
		for (const db of this.databases) {
			const migrations = await unroll(
				DatabaseMigrate.migrations(join("./migration", db.name)),
			);
			const migrate = new DatabaseMigrate(db);
			const plan = migrate.plan(migrations);

			if (this.config.database.migrate) {
				if (!DatabaseMigrate.viable(plan)) {
					throw new DatabaseMigrationPlanUnachievableError(db.name, plan);
				}
				migrate.act(plan);
			}

			await db.spawn();

			await this.watch(db);
		}
	}

	/**
	 * watches every domain so that a generation another instance swapped in is picked up
	 *
	 * the swap itself is a `rename` within the domain root, which is what the watch reports
	 */
	private async watch(db: IDatabaseSwappable<DatabaseName>): Promise<void> {
		for (const [name, domain] of db.domains) {
			/** the probe below is in flight, every event until it lands is its own */
			let probing = true;
			/** armed by the probe, reports the event it provoked */
			let report = (): void => {};

			// `persistent: false` → don't keep process alive
			const watcher = watch(domain.root, { persistent: false }, () => {
				if (probing) {
					report();
					return;
				}

				void this.reconcile(db, name, domain).catch((error) => {
					logger.error(`error reopening <${db.name}> through <${name}>`, {
						database: db.name,
						attached: name,
						root: domain.root,
						error,
					});
				});
			});

			watcher.on("error", (error) => {
				logger.error(`error watching <${domain.root}>`, {
					database: db.name,
					attached: name,
					root: domain.root,
					error,
				});
			});

			this.watchers.push(watcher);

			logger.debug(`watching <${domain.root}> for <${db.name}>`, {
				database: db.name,
				attached: name,
				root: domain.root,
			});

			// watch doesn't immediately start reporting, every event until then is dropped
			// a swap among them could leave the connection on a superseded generation
			// → fabricate an event to detect that reporting has started
			{
				const probe = join(domain.root, `.probe-${randomUUID()}`);
				let reported = false;

				for (
					let attempt = 0;
					attempt < probeWithin / probeEvery && !reported;
					attempt += 1
				) {
					const landed = new Promise<void>((resolve) => {
						report = () => {
							reported = true;
							resolve();
						};
						void sleep(probeEvery).then(resolve);
					});

					await writeFile(probe, "");
					await rm(probe, { force: true });

					await landed;
				}

				if (!reported) {
					throw new DatabaseWatchInertError(domain.root);
				}

				probing = false;
			}

			// the connection was opened before the watch came up
			// handle a swap that landed in between, or while the probe was in flight
			await this.reconcile(db, name, domain);
		}
	}

	/**
	 * reopens the database if `current` resolves to a file other than open one
	 *
	 * the instance that performed the swap is left alone.
	 * other instance open the generation that was swapped in
	 */
	protected async reconcile(
		db: IDatabase<DatabaseName>,
		name: string,
		domain: DatabaseDomain,
	): Promise<void> {
		// a reopen only ever opens what `current` resolved to while it ran
		// one that was already in flight may well land on a generation that has since been superseded
		// → compare again after it settles
		while (true) {
			let resolved: string;
			try {
				resolved = peek(domain.current).resolved;
			} catch (e) {
				// mid-swap, whichever event settles the layout reports again
				if (e instanceof DatabaseDomainGenerationDiscardedError) {
					return;
				}

				throw e;
			}

			const open = db.raw.location(name);
			if (isNone(open) || open === resolved) {
				return;
			}

			logger.info(`<${db.name}> fell behind <${name}>, reopening`, {
				database: db.name,
				attached: name,
				root: domain.root,
				open,
				resolved,
			});

			await db.respawn();
		}
	}

	async onApplicationShutdown(): Promise<void> {
		for (const watcher of this.watchers.splice(0)) {
			watcher.close();
		}

		for (const db of this.databases) {
			try {
				await db.despawn();
			} catch (error) {
				logger.error(`error despawning <${db.name}>`, { error });
			}
		}
	}
}
