import {
	type BeforeApplicationShutdown,
	Inject,
	Injectable,
	type OnApplicationBootstrap,
} from "@nestjs/common";
import type { PickDeep } from "type-fest";

import race from "../../../utility/race-as-promised";
import { Config } from "../../config/config.module";
import { ServiceLockfileCoordinator } from "../../database/lockfile-coordinator.service";
import { ServiceSnapshotDeferIngest } from "./ingest.service";

@Injectable()
export class ServiceSnapshotDeferIngestCoordinator
	implements OnApplicationBootstrap, BeforeApplicationShutdown
{
	private controller = new AbortController();

	constructor(
		@Inject(Config)
		private readonly config: PickDeep<Config, "snapshot.defer.process">,
		@Inject(ServiceSnapshotDeferIngest)
		private ingest: ServiceSnapshotDeferIngest,
		@Inject(ServiceLockfileCoordinator)
		private lockfileCoordinator: ServiceLockfileCoordinator,
	) {}

	onApplicationBootstrap(): void {
		if (!this.config.snapshot.defer.process) {
			return;
		}

		void (async () => {
			const aborted = new Promise<void>((resolve) =>
				this.controller.signal.addEventListener("abort", () => resolve()),
			);

			await race([this.lockfileCoordinator._unlocked, aborted]);

			if (this.controller.signal.aborted) {
				return;
			}

			for await (const step of this.ingest.ingest()) {
				let delay;
				switch (step) {
					case "idle":
						delay = 5_000;
						break;
					case "acted":
						delay = 100;
						break;
				}

				await race([
					new Promise((resolve) => setTimeout(resolve, delay)),
					aborted,
				]);

				if (this.controller.signal.aborted) {
					return;
				}
			}
		})();
	}

	async beforeApplicationShutdown(): Promise<void> {
		this.controller.abort();
	}
}
