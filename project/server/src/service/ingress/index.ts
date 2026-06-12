import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { ceil, floor, type Integer } from "../../type/codec/integer";
import { type Parameters, paths } from "../../web/base";
import { DatabaseSnapshotVoucherPayload } from "../../web/database/snapshot/base";
import { IVoucher, type SealedVoucher, Voucher } from "../voucher";

export interface IIngress {
	origin: string;
	header: {
		/**
		 * @param path path segment of url
		 * @param page current page, starting at 0
		 * @param size requested page size
		 * @param count overall count of items in collection
		 */
		link(path: string, page: Integer, size: Integer, count: Integer): string;
	};
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

	private headerLink(
		path: string,
		page: Integer,
		size: Integer,
		count: Integer,
	) {
		// pages are 0-indexed
		const last = ceil(count / size - 1);

		const url = (page: Integer, size: Integer) => {
			const url = new URL(path, this.origin);
			url.searchParams.delete("page");
			url.searchParams.delete("size");
			if (page > 0) {
				url.searchParams.set("page", String(page));
			}
			url.searchParams.set("size", String(size));

			return url;
		};

		const relationships: string[] = [
			`<${url(floor(0), size)}>; rel="first"`,
			`<${url(last, size)}>; rel="last"`,
		];

		prev: {
			const prev = floor(page - 1);

			if (prev < 0) {
				break prev;
			}

			// navigated past end → no previous page
			if (prev > last) {
				break prev;
			}

			relationships.push(`<${url(prev, size)}>; rel="prev"`);
		}

		next: {
			const next = floor(page + 1);

			if (next > last) {
				break next;
			}

			relationships.push(`<${url(next, size)}>; rel="next"`);
		}

		return relationships.join(", ");
	}

	header = {
		link: this.headerLink.bind(this),
	};

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
