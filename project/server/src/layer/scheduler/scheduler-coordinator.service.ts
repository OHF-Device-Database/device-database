import { hrtime } from "node:process";

import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { logger as parentLogger } from "../../logger";
import { SuspendableHandle } from "../../service/suspendable";
import { formatNs } from "../../utility/format";
import { Config } from "../config/config.module";
import { ServiceLockfileCoordinator } from "../database/lockfile-coordinator.service";
import { ServiceSnapshotDeferIngest } from "../snapshot/defer/ingest.service";
import { ServiceScheduler } from "./scheduler.service";

const logger = parentLogger.child({ label: "scheduler-coordinator" });

@Injectable()
export class ServiceSchedulerCoordinator implements OnApplicationShutdown {
	private controller = new AbortController();

	constructor(
		@Inject(Config) config: PickDeep<Config, "scheduler.enable">,
		@Inject(ServiceScheduler) scheduler: ServiceScheduler,
		@Inject(ServiceLockfileCoordinator)
		lockfileCoordinator: ServiceLockfileCoordinator,
		@Inject(ServiceSnapshotDeferIngest) ingest: ServiceSnapshotDeferIngest,
	) {
		if (!config.scheduler.enable) {
			return;
		}

		void (async () => {
			await lockfileCoordinator.unlocked;

			logger.info("started");

			const handle = new SuspendableHandle(Symbol("Derive"));

			let epoch = ServiceScheduler.epoch();
			while (true) {
				if (this.controller.signal.aborted) {
					break;
				}

				epoch = await scheduler.wait(epoch);
				const plan = scheduler.plan(epoch);

				if (!ServiceScheduler.viable(plan)) {
					throw new Error(
						`scheduler plan not viable <${JSON.stringify(plan)}>`,
					);
				}

				// pause ingesting to prevent wal growth
				{
					const start = hrtime.bigint();
					await ingest.suspend(handle);
					const end = hrtime.bigint();
					logger.debug(`paused ingestion in ${formatNs(end - start)}s`, {
						took: end - start,
					});
				}

				for await (const status of scheduler.act(plan)) {
					switch (status.kind) {
						case "pending":
							logger.info(`running <${status.id.description}>`, {
								identifier: status.id,
							});
							break;
						case "success":
							logger.info(
								`ran <${status.id.description}> in ${formatNs(status.took)}s`,
								{ identifier: status.id, took: status.took },
							);
							break;
						case "error":
							logger.error(`error while running <${status.id.description}>`, {
								identifier: status.id,
							});
							console.error(status.error);
					}
				}

				ingest.resume(handle);
			}
		})();
	}

	async onApplicationShutdown(): Promise<void> {
		this.controller.abort();
	}
}
