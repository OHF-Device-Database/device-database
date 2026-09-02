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
import { unroll } from "../../utility/iterable";
import { Config } from "../config/config.module";
import { Databases } from "./database.module";

import type { DatabaseName } from "../../service/database/base";

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
	constructor(
		@Inject(Config)
		private readonly config: PickDeep<Config, "database.migrate">,
		@Inject(Databases) private readonly databases: Databases,
	) {}

	async onModuleInit(): Promise<void> {
		for (const { database: db, workerCount } of this.databases) {
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

			await db.spawn(workerCount);
			logger.info(`spawned <${db.name}>`, { workerCount });
		}
	}

	async onApplicationShutdown(): Promise<void> {
		for (const { database: db } of this.databases) {
			try {
				await db.despawn();
			} catch (error) {
				logger.error(`error despawning <${db.name}>`, { error });
			}
		}
	}
}
