import { createType, inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { ConfigProvider } from "../../config";
import { type Parameters, paths } from "../../web/base";
import { IVoucher, type SealedVoucher } from "../voucher";

export interface IIngress {
	origin: string;
	url: {
		databaseSnapshot(sealed: SealedVoucher<"database-snapshot">): string;
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

	private urlDatabaseSnapshot(
		sealed: SealedVoucher<"database-snapshot">,
	): string {
		const path = paths["database-snapshot"];
		const codec = Schema.Struct({});
		const query = {
			voucher: this.voucher.serialize(sealed, codec),
		} satisfies Parameters["database-snapshot"]["query"];

		return `${this.origin}${path}?${new URLSearchParams(query).toString()}`;
	}

	url = {
		databaseSnapshot: this.urlDatabaseSnapshot.bind(this),
	};
}
