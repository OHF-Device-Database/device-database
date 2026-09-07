import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ServiceIngress } from "./ingress.service";

@Module({
	imports: [ModuleConfig],
	providers: [ServiceIngress],
	exports: [ServiceIngress],
})
export class ModuleIngress {}
