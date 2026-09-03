import { Inject, Injectable } from "@nestjs/common";

import { Scheduler } from "../../service/scheduler";
import { ServiceIntrospection } from "../introspection/introspection.service";
import { SchedulerScheduled } from "./scheduler.registry";

@Injectable()
export class ServiceScheduler extends Scheduler {
	constructor(
		@Inject(SchedulerScheduled) scheduled: SchedulerScheduled,
		@Inject(ServiceIntrospection) introspection: ServiceIntrospection,
	) {
		super(scheduled, introspection);
	}
}
