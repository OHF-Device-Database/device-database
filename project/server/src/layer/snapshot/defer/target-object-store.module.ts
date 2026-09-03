import { Module } from "@nestjs/common";

import { ModuleConfig } from "../../config/config.module";
import { ModuleSnapshot } from "../snapshot.module";
import {
	_ModuleSnapshotDeferTarget,
	SnapshotDeferTarget,
} from "./target.interface";
import { ServiceSnapshotDeferTargetObjectStore } from "./target-object-store.service";

@Module({
	imports: [ModuleConfig, ModuleSnapshot],
	providers: [
		{
			provide: SnapshotDeferTarget,
			useClass: ServiceSnapshotDeferTargetObjectStore,
		},
	],
	exports: [SnapshotDeferTarget],
})
export class ModuleSnapshotDeferTargetObjectStore extends _ModuleSnapshotDeferTarget {}
