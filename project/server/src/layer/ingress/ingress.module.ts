import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ModuleVoucher } from "../voucher/voucher.module";
import { ServiceIngress } from "./ingress.service";

@Module({
	imports: [ModuleConfig, ModuleVoucher],
	providers: [ServiceIngress],
	exports: [ServiceIngress],
})
export class ModuleIngress {}
