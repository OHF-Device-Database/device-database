import { Module } from "@nestjs/common";

import { ControllerOpenapiExplorer } from "./explorer.controller";
import { ServiceOpenapiExplorer } from "./explorer.service";

@Module({
	controllers: [ControllerOpenapiExplorer],
	providers: [ServiceOpenapiExplorer],
})
export class ModuleOpenapiExplorer {}
