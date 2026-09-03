import { Inject, Injectable } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { Voucher } from "../../service/voucher";
import { Config } from "../config/config.module";

@Injectable()
export class ServiceVoucher extends Voucher {
	constructor(@Inject(Config) config: PickDeep<Config, "signing.voucher">) {
		super(config.signing.voucher);
	}
}
