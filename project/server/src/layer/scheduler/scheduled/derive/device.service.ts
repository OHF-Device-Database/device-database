import { Inject, Injectable } from "@nestjs/common";

import { SchedulerScheduledDeriveDevice } from "../../../../service/scheduler/scheduled/derive/device";
import { DatabaseDerived } from "../../../database/database.module";

import type { IDatabase } from "../../../../service/database";

@Injectable()
export class ServiceSchedulerScheduledDeriveDevice extends SchedulerScheduledDeriveDevice {
	constructor(@Inject(DatabaseDerived) db: IDatabase<"derived">) {
		super(db);
	}
}
