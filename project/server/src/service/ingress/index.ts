import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { type Parameters, paths } from "../../web/base";
import { DatabaseSnapshotVoucherPayload } from "../../web/database/snapshot/base";
import { IVoucher, type SealedVoucher, Voucher } from "../voucher";

export interface IIngress {
	origin: string;
	url: {
		databaseSnapshot(
			sealed: SealedVoucher<
				"database-snapshot",
				DatabaseSnapshotVoucherPayload
			>,
		): string;
	};
}

export const IIngress = createType<IIngress>("IIngress");

export class Ingress implements IIngress {
	constructor(
		private external = inject(ConfigProvider)((c) => c.external),
		private voucher = inject(IVoucher),
	) {}

	get origin() {
		return `${this.external.secure ? "https" : "http"}://${this.external.authority}`;
	}

	private urlDatabaseSnapshotStale(
		sealed: SealedVoucher<"database-snapshot", DatabaseSnapshotVoucherPayload>,
	): string {
		const path = paths["database-snapshot"];
		const query = {
			voucher: this.voucher.serialize(sealed, DatabaseSnapshotVoucherPayload),
		} satisfies Parameters["database-snapshot"]["query"];

		const peeked = Voucher.peek(sealed);

		// `:name` is set so that name of downloaded file reflects the coordinator name
		return `${this.origin}${path.replace(":name", `${peeked.coordinator}.db`)}?${new URLSearchParams(query).toString()}`;
	}

	url = {
		databaseSnapshot: this.urlDatabaseSnapshotStale.bind(this),
	};
}
