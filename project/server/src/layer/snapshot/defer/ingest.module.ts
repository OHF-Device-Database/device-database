import { Module } from "@nestjs/common";

import { ModuleIntrospection } from "../../introspection/introspection.module";
import { ModuleSnapshot } from "../snapshot.module";
import { ServiceSnapshotDeferIngest } from "./ingest.service";

@Module({
	// `SnapshotDeferTarget` is resolved from the global registration so that concrete implementation
	// can be selected at app root
	imports: [ModuleSnapshot, ModuleIntrospection],
	providers: [ServiceSnapshotDeferIngest],
	exports: [ServiceSnapshotDeferIngest],
})
export class ModuleSnapshotDeferIngest {}
