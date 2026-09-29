import { Inject, Injectable } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { Snapshot } from "../../service/snapshot";
import { Config } from "../config/config.module";
import { DatabaseStaging } from "../database/database.module";
import { ServiceIntrospection } from "../introspection/introspection.service";
import { ServiceVoucher } from "../voucher/voucher.service";

import type { IDatabase } from "../../service/database";

@Injectable()
export class ServiceSnapshot extends Snapshot {
	constructor(
		@Inject(Config) config: PickDeep<
			Config,
			| "snapshot.voucher.expectedAfter"
			| "snapshot.voucher.ttl"
			| "snapshot.voucher.minSeq"
		>,
		@Inject(DatabaseStaging) database: IDatabase<"staging">,
		@Inject(ServiceIntrospection) introspection: ServiceIntrospection,
		@Inject(ServiceVoucher) voucher: ServiceVoucher,
	) {
		super(database, introspection, voucher, {
			voucher: config.snapshot.voucher,
		});
	}
}
