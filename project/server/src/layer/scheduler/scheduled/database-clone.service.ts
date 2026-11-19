import { Inject, Injectable } from "@nestjs/common";

import { DatabaseStaging } from "../../database/database.module";

import type {
	DatabaseSwappableGeneration,
	IDatabaseSwappable,
} from "../../../service/database";
import type {
	SchedulerScheduled,
	SchedulerScheduledDescriptor,
} from "../../../service/scheduler/base";

@Injectable()
export class ServiceSchedulerScheduledDatabaseClone
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledDatabaseClone,
			ServiceSchedulerScheduledDatabaseCloneDescriptor
		>
{
	static readonly id = Symbol("ServiceSchedulerScheduledDatabaseClone");

	static readonly prerequisites = [];

	constructor(
		@Inject(DatabaseStaging) private db: IDatabaseSwappable<"staging">,
	) {}

	async run(): Promise<DatabaseSwappableGeneration<"staging">> {
		const clone = await this.db.copy(undefined, {
			foreign_keys: "on",
			journal_mode: "memory",
			synchronous: "off",
		});
		await clone.spawn();

		return clone;
	}
}
export type ServiceSchedulerScheduledDatabaseCloneDescriptor =
	SchedulerScheduledDescriptor<
		typeof ServiceSchedulerScheduledDatabaseClone.id,
		DatabaseSwappableGeneration<"staging">
	>;
