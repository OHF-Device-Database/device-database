import { createType, inject } from "@lppedd/di-wise-neo";

import { ConfigProvider } from "../../config";
import { ceil, floor, type Integer } from "../../type/codec/integer";
import { type Parameters, paths } from "../../web/base";
import { DatabaseSnapshotVoucherPayload } from "../../web/database/snapshot/base";
import { IVoucher, type SealedVoucher, Voucher } from "../voucher";

import type { Uuid } from "../../type/codec/uuid";

const RelationshipsSymbol = Symbol("LinkRel");
type Relationships = {
	[RelationshipsSymbol]: {
		first: URL;
		last: URL;
		prev?: URL;
		next?: URL;
	};
};

export const peek = (relationshipts: Relationships) =>
	relationshipts[RelationshipsSymbol];

export interface IIngress {
	origin: string;
	header: {
		link(relationships: Relationships): string;
	};
	/**
	 * @param path path segment of url
	 * @param page current page, starting at 0
	 * @param size requested page size
	 * @param count overall count of items in collection
	 */
	relationships(
		path: string | URL,
		page: Integer,
		size: Integer,
		count: Integer,
	): Relationships;
	url: {
		device: {
			self(id: Uuid): URL;
			duplicates(id: Uuid): URL;
		};

		databaseSnapshot(
			sealed: SealedVoucher<
				"database-snapshot",
				DatabaseSnapshotVoucherPayload
			>,
		): URL;
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

	public relationships(
		path: string | URL,
		page: Integer,
		size: Integer,
		count: Integer,
	): Relationships {
		// pages are 0-indexed
		const last = ceil(count / size - 1);

		const url = (page: Integer, size: Integer) => {
			const url =
				typeof path === "string" ? new URL(path, this.origin) : new URL(path);
			url.searchParams.delete("page");
			url.searchParams.delete("size");
			if (page > 0) {
				url.searchParams.set("page", String(page));
			}
			url.searchParams.set("size", String(size));

			return url;
		};

		const rel: Relationships[typeof RelationshipsSymbol] = {
			first: url(floor(0), size),
			last: url(last, size),
		};

		prev: {
			const prev = floor(page - 1);

			if (prev < 0) {
				break prev;
			}

			// navigated past end → no previous page
			if (prev > last) {
				break prev;
			}

			rel.prev = url(prev, size);
		}

		next: {
			const next = floor(page + 1);

			if (next > last) {
				break next;
			}

			rel.next = url(next, size);
		}

		return { [RelationshipsSymbol]: rel };
	}

	private headerLink(relationships: Relationships): string {
		const rel = relationships[RelationshipsSymbol];
		const parts: string[] = [
			`<${rel.first}>; rel="first"`,
			`<${rel.last}>; rel="last"`,
		];

		if (rel.prev) {
			parts.push(`<${rel.prev}>; rel="prev"`);
		}

		if (rel.next) {
			parts.push(`<${rel.next}>; rel="next"`);
		}

		return parts.join(", ");
	}

	header = {
		link: this.headerLink.bind(this),
	};

	private urlDeviceSelf(id: Uuid) {
		return new URL(`/api/unstable/derived/devices/${id}`, this.origin);
	}

	private urlDeviceDuplicates(id: Uuid) {
		return new URL(
			`/api/unstable/derived/devices/${id}/duplicates`,
			this.origin,
		);
	}

	private urlDatabaseSnapshotStale(
		sealed: SealedVoucher<"database-snapshot", DatabaseSnapshotVoucherPayload>,
	): URL {
		const path = paths["database-snapshot"];
		const query = {
			voucher: this.voucher.serialize(sealed, DatabaseSnapshotVoucherPayload),
		} satisfies Parameters["database-snapshot"]["query"];

		const peeked = Voucher.peek(sealed);

		// `:name` is set so that name of downloaded file reflects the coordinator name
		return new URL(
			`${path.replace(":name", `${peeked.coordinator}.db`)}?${new URLSearchParams(query).toString()}`,
			this.origin,
		);
	}

	url = {
		device: {
			self: this.urlDeviceSelf.bind(this),
			duplicates: this.urlDeviceDuplicates.bind(this),
		},
		databaseSnapshot: this.urlDatabaseSnapshotStale.bind(this),
	};
}
