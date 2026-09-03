import { Inject, Injectable } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { SnapshotDeferTargetObjectStore } from "../../../service/snapshot/defer/object-store";
import { Config } from "../../config/config.module";
import { ServiceSnapshot } from "../snapshot.service";

@Injectable()
export class ServiceSnapshotDeferTargetObjectStore extends SnapshotDeferTargetObjectStore {
	constructor(
		@Inject(Config) config: PickDeep<Config, "snapshot.defer.objectStore">,
		@Inject(ServiceSnapshot) snapshot: ServiceSnapshot,
	) {
		super(snapshot, config.snapshot.defer.objectStore);
	}
}
