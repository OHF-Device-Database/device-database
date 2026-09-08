import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { config, SnapshotDeferTarget } from "../config";
import { ModuleCallbackVendorSlack } from "./callback/vendor/slack/slack.module";
import { ModuleDatabaseCoordinator } from "./database/database-coordinator.module";
import { ModuleLockfileCoordinator } from "./database/lockfile-corrdinator.module";
import { ModuleHealth } from "./health/health.module";
import { ModuleIntrospection } from "./introspection/introspection.module";
import { InterceptorRouteRequest } from "./request.interceptor";
import { InterceptorEndpointResponse } from "./response.interceptor";
import { ModuleSchedulerCoordinator } from "./scheduler/scheduler-coordinator.module";
import { ModuleSnapshotDeferIngestCoordinator } from "./snapshot/defer/ingest-coordinator.module";
import { ModuleSnapshotDeferTarget } from "./snapshot/defer/target.module";
import { ModuleSnapshotDeferTargetObjectStore } from "./snapshot/defer/target-object-store.module";

// resolved eagerly because module metadata is evaluated before the injector exists
const c = config();

@Module({
	imports: [
		// intentionally first so it's interceptor wraps all succeeding imports
		ModuleIntrospection,
		// needs to be explicitly imported for lifecycle hooks to fire
		ModuleDatabaseCoordinator,
		ModuleLockfileCoordinator,
		ModuleSchedulerCoordinator,
		...(c.snapshot.defer.target === SnapshotDeferTarget.ObjectStore
			? [
					ModuleSnapshotDeferTarget.forRoot(
						ModuleSnapshotDeferTargetObjectStore,
					),
				]
			: []),
		ModuleSnapshotDeferIngestCoordinator,
		ModuleCallbackVendorSlack.forRoot(c),
		ModuleHealth,
	],
	providers: [
		{ provide: APP_INTERCEPTOR, useClass: InterceptorRouteRequest },
		{ provide: APP_INTERCEPTOR, useClass: InterceptorEndpointResponse },
	],
})
export class ModuleApp {}
