import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { ModuleDatabaseCoordinator } from "./database/database-coordinator.module";
import { ModuleHealth } from "./health/health.module";
import { InterceptorRouteRequest } from "./request.interceptor";
import { InterceptorEndpointResponse } from "./response.interceptor";

@Module({
	imports: [ModuleDatabaseCoordinator, ModuleHealth],
	providers: [
		{ provide: APP_INTERCEPTOR, useClass: InterceptorRouteRequest },
		{ provide: APP_INTERCEPTOR, useClass: InterceptorEndpointResponse },
	],
})
export class ModuleApp {}
