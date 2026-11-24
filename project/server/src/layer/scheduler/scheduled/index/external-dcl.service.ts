import { Inject, Injectable } from "@nestjs/common";

import { logger as parentLogger } from "../../../../logger";
import { ServiceIndexExternalDcl } from "../../../index/external/dcl/dcl.service";

import type {
	SchedulerScheduled,
	SchedulerScheduledDescriptor,
} from "../../../../service/scheduler/base";

const logger = parentLogger.child({ label: "scheduled-index-external-dcl" });

@Injectable()
export class ServiceSchedulerScheduledIndexExternalDcl
	implements
		SchedulerScheduled<
			typeof ServiceSchedulerScheduledIndexExternalDcl,
			ServiceSchedulerScheduledIndexExternalDclDescriptor
		>
{
	static readonly id = Symbol("ServiceSchedulerScheduledIndexExternalDcl");

	static readonly prerequisites = [];
	static readonly schedule = {
		minute: "30",
	} as const;

	constructor(
		@Inject(ServiceIndexExternalDcl)
		private readonly dcl: ServiceIndexExternalDcl,
	) {}

	async run(): Promise<void> {
		if (!this.dcl.configured) {
			return;
		}

		// walking the ledger from scratch is left to seeding
		if (!(await this.dcl.available())) {
			logger.warn("ledger index not seeded, skipped");
			return;
		}

		await this.dcl.sync();
	}
}
export type ServiceSchedulerScheduledIndexExternalDclDescriptor =
	SchedulerScheduledDescriptor<
		typeof ServiceSchedulerScheduledIndexExternalDcl.id,
		void
	>;
