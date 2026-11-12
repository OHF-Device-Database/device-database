import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import { join } from "node:path";

import {
	Inject,
	Injectable,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { logger as parentLogger } from "../../logger";
import {
	DatabaseMigrate,
	type DatabaseMigratePlanUnachievable,
} from "../../service/database/migrate";
import { isNone } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import { Config } from "../config/config.module";
import { Databases } from "./database.module";

import type { IDatabase } from "../../service/database";
import type { DatabaseName } from "../../service/database/base";
import type { DatabaseDomain } from "../../service/database/domain";

const logger = parentLogger.child({ label: "database-coordinator" });

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
	 * watches every domain the database is opened through, so that a generation another instance
	 * swapped in is picked up
	 *
	 * the swap itself is a `rename` within the domain root, which is what the watch reports
	 */
	private async watch(db: IDatabase<DatabaseName>): Promise<void> {
		for (const [name, domain] of db.domains) {
			// `persistent: false`, the watch must not be what keeps the process alive
			const watcher = watch(domain.root, { persistent: false }, () => {
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

			// the connection was opened before the watch came up, so a swap that landed in between
			// has no event left to report — comparing once settles that
			await this.reconcile(db, name, domain);
		}
	}

	/**
	 * reopens the database if `current` resolves to a file other than open one
	 *
	 * the instance that performed the swap is left alone.
	 * other instance open the generation that was swapped in
	 */
	private async reconcile(
		db: IDatabase<DatabaseName>,
		name: string,
		domain: DatabaseDomain,
	): Promise<void> {
		// a reopen only ever opens what `current` resolved to while it ran
		// one that was already in flight may well land on a generation that has since been superseded
		// → compare again after it settles
		while (true) {
			const resolved = domain.resolved;
			// mid-swap or not bootstrapped, whichever event settles the layout reports again
			if (typeof resolved === "undefined") {
				return;
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
