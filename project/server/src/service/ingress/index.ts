import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { type Parameters, paths } from "../../web/base";
import { IVoucher, type SealedVoucher } from "../voucher";

export interface IIngress {
	origin: string;
	url: {
		databaseSnapshot: {
			current(sealed: SealedVoucher<"database-snapshot">): string;
			cached(): string;
		};
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

	private urlDatabaseSnapshotCurrent(
		sealed: SealedVoucher<"database-snapshot">,
	): string {
		const path = paths["database-snapshot-current"];
		const query = {
			voucher: this.voucher.serialize(sealed),
		} satisfies Parameters["database-snapshot-current"]["query"];

		return `${this.origin}${path}?${new URLSearchParams(query).toString()}`;
	}

	private urlDatabaseSnapshotCached(): string {
		const path = paths["database-snapshot-current"];

		return `${this.origin}${path}`;
	}

	url = {
		databaseSnapshot: {
			current: this.urlDatabaseSnapshotCurrent.bind(this),
			cached: this.urlDatabaseSnapshotCached.bind(this),
		},
	};
}
