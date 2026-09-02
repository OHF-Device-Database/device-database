import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { ModuleConfig } from "../config/config.module";
import { ControllerIntrospection } from "./introspection.controller";
import { InterceptorIntrospection } from "./introspection.interceptor";
import { ServiceIntrospection } from "./introspection.service";

@Module({
	imports: [ModuleConfig],
	controllers: [ControllerIntrospection],
	providers: [
		ServiceIntrospection,
		{ provide: APP_INTERCEPTOR, useClass: InterceptorIntrospection },
	],
	exports: [ServiceIntrospection],
})
export class ModuleIntrospection {}
