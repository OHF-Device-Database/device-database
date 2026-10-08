import { hrtime } from "node:process";

import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { logger as parentLogger } from "../../logger";
import { Suspendable, SuspendableHandle } from "../../service/suspendable";
import { AbortedSymbol, aborted } from "../../utility/aborted";
import { formatNs } from "../../utility/format";
import race from "../../utility/race-as-promised";
import { Config } from "../config/config.module";
import { ServiceLockfileCoordinator } from "../database/lockfile-coordinator.service";
import { ServiceSnapshotDeferIngest } from "../snapshot/defer/ingest.service";
import { ServiceScheduler } from "./scheduler.service";

import type {
	SchedulerActStatus,
	SchedulerPlan,
	SchedulerPlanStrategy,
} from "../../service/scheduler";
import type { ISchedulerCoordinator } from "../../service/scheduler/coordinator";

const logger = parentLogger.child({ label: "scheduler-coordinator" });

const SchedulerCoordinatorSymbol = Symbol("SchedulerCoordinatorSymbol");

@Injectable()
export class ServiceSchedulerCoordinator
	extends Suspendable
	implements ISchedulerCoordinator, OnApplicationShutdown
{
	private controller = new AbortController();

	private acting: boolean = false;

	constructor(
		@Inject(Config) config: PickDeep<Config, "scheduler.enable">,
		@Inject(ServiceScheduler) private readonly scheduler: ServiceScheduler,
		@Inject(ServiceLockfileCoordinator)
		lockfileCoordinator: ServiceLockfileCoordinator,
		@Inject(ServiceSnapshotDeferIngest)
		private readonly ingest: ServiceSnapshotDeferIngest,
	) {
		super();

		if (!config.scheduler.enable) {
			return;
		}

		void (async () => {
			await lockfileCoordinator.unlocked;

			logger.info("started");

			let epoch = ServiceScheduler.epoch();
			while (true) {
				const raced = await race([
					this.scheduler.wait(epoch),
					aborted(this.controller.signal),
				]);
				if (raced === AbortedSymbol) {
					break;
				}
				epoch = raced;

				const plan = this.scheduler.plan(epoch);
				if (!ServiceScheduler.viable(plan)) {
					throw new Error(
						`scheduler plan not viable <${JSON.stringify(plan)}>`,
					);
				}

				// just awaiting suspension lift leaves a window between lift and `this.acting` being set
				// a new suspension coming in during that window would observe a stale `this.acting` value
				// spinning on synchronous resume check forces `this.acting` modification to take place in same synchronous block
				while (!this.resumed) {
					await this.suspended();
				}

				this.acting = true;
				try {
					for await (const status of this._act(
						plan,
						new SuspendableHandle(SchedulerCoordinatorSymbol),
					)) {
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
				} finally {
					this.acting = false;
					this.settle();
				}
			}
		})();
	}

	private async *_act(
		plan: SchedulerPlanStrategy,
		handle: SuspendableHandle,
	): AsyncIterable<SchedulerActStatus> {
		try {
			{
				const start = hrtime.bigint();
				// pause ingesting to prevent wal growth
				await this.ingest.suspend(handle);
				const end = hrtime.bigint();
				logger.debug(`paused ingestion in ${formatNs(end - start)}s`, {
					took: end - start,
				});
			}

			yield* this.scheduler.act(plan);
		} finally {
			this.ingest.resume(handle);
		}
	}

	public scheduleable(): Iterable<symbol> {
		return this.scheduler.scheduleable();
	}

	public plan(id: symbol): SchedulerPlan {
		return this.scheduler.plan(id);
	}

	/** acts on plan for the scheduled unit identified by `id` */
	public async *run(plan: SchedulerPlanStrategy, handle: SuspendableHandle) {
		await this.suspend(handle);
		try {
			yield* this._act(plan, handle);
		} finally {
			this.resume(handle);
		}
	}

	/** waits for the plan currently being acted on to finalize */
	override drain(): Promise<void> {
		return this.park(this.acting);
	}

	async onApplicationShutdown(): Promise<void> {
		this.controller.abort();
	}
}
