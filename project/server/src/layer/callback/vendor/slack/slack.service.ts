import { Inject, Injectable } from "@nestjs/common";

import { CallbackVendorSlack } from "../../../../service/callback/vendor/slack";
import { ServiceSnapshotDeferIngest } from "../../../snapshot/defer/ingest.service";

@Injectable()
export class ServiceCallbackVendorSlack extends CallbackVendorSlack {
	constructor(
		config: { signingKey: string; botToken: string },
		@Inject(ServiceSnapshotDeferIngest) ingest: ServiceSnapshotDeferIngest,
	) {
		super(config, ingest);
	}
}
