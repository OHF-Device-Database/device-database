import { Inject, Injectable } from "@nestjs/common";

import { SchedulerScheduledDeriveSubject } from "../../../../service/scheduler/scheduled/derive/subject";
import { DatabaseDerived } from "../../../database/database.module";

import type { IDatabase } from "../../../../service/database";

@Injectable()
export class ServiceSchedulerScheduledDeriveSubject extends SchedulerScheduledDeriveSubject {
	constructor(@Inject(DatabaseDerived) db: IDatabase<"derived">) {
		super(db);
	}
}
