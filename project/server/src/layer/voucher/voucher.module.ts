import { Module } from "@nestjs/common";

import { ModuleConfig } from "../config/config.module";
import { ServiceVoucher } from "./voucher.service";

@Module({
	imports: [ModuleConfig],
	providers: [ServiceVoucher],
	exports: [ServiceVoucher],
})
export class ModuleVoucher {}
