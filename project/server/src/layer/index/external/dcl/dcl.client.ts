import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { isNone, type Maybe } from "../../../../type/maybe";

import type { Config } from "../../../config/config.module";
import type { IndexFetch } from "../../paced";

export type IndexExternalDclConfig = Omit<Config["index"]["dcl"], "enable">;

/** identifies a ledger entry, field names match the ledger's */
export type IndexExternalDclKey =
	| { kind: "vendor"; vendorID: number }
	| { kind: "model"; vid: number; pid: number }
	| { kind: "model-version"; vid: number; pid: number; softwareVersion: number }
	| {
			kind: "compliance";
			vid: number;
			pid: number;
			softwareVersion: number;
			certificationType: string;
	  };

export class IndexExternalDclRequestError extends Error {
	constructor(
		public path: string,
		public status: number,
		public body: string,
	) {
		super(`dcl request <${path}> failed with <${status}>`);
		Object.setPrototypeOf(this, IndexExternalDclRequestError.prototype);
	}
}

const VendorKey = Schema.Struct({ vendorID: Schema.Number });
const ModelKey = Schema.Struct({
	vid: Schema.Number,
	pid: Schema.Number,
	softwareVersion: Schema.optional(Schema.Number),
});
const ComplianceKey = Schema.Struct({
	vid: Schema.Number,
	pid: Schema.Number,
	softwareVersion: Schema.Number,
	certificationType: Schema.String,
});

/** key of an entry or message of a ledger module, `null` for modules out of scope */
export const keyed = (
	module: string,
	value: unknown,
): Maybe<IndexExternalDclKey> => {
	switch (module) {
		case "vendorinfo": {
			const decoded = Schema.decodeUnknownEither(VendorKey)(value);
			return decoded._tag === "Right"
				? { kind: "vendor", vendorID: decoded.right.vendorID }
				: null;
		}
		case "model": {
			const decoded = Schema.decodeUnknownEither(ModelKey)(value);
			if (isLeft(decoded)) {
				return null;
			}

			const { vid, pid, softwareVersion } = decoded.right;
			return typeof softwareVersion === "undefined"
				? { kind: "model", vid, pid }
				: { kind: "model-version", vid, pid, softwareVersion };
		}
		case "compliance": {
			const decoded = Schema.decodeUnknownEither(ComplianceKey)(value);
			return decoded._tag === "Right"
				? { kind: "compliance", ...decoded.right }
				: null;
		}
		default:
			return null;
	}
};

const Height = Schema.Struct({
	block: Schema.Struct({
		header: Schema.Struct({ height: Schema.NumberFromString }),
	}),
});

const Page = Schema.Struct({
	pagination: Schema.NullishOr(
		Schema.Struct({ next_key: Schema.NullishOr(Schema.String) }),
	),
});

const Versions = Schema.Struct({
	modelVersions: Schema.Struct({
		softwareVersions: Schema.Array(Schema.Number),
	}),
});

const Txs = Schema.Struct({
	tx_responses: Schema.NullishOr(
		Schema.Array(
			Schema.Struct({
				height: Schema.NumberFromString,
				code: Schema.Number,
				tx: Schema.Struct({
					body: Schema.Struct({ messages: Schema.Array(Schema.Unknown) }),
				}),
			}),
		),
	),
	total: Schema.NumberFromString,
});

const Message = Schema.Struct({ "@type": Schema.String });

const PAGE = 100;

/** rest interface of a distributed compliance ledger node */
export class IndexExternalDcl {
	constructor(
		private readonly config: IndexExternalDclConfig,
		private readonly fetch: IndexFetch = (input, init) =>
			globalThis.fetch(input, init),
	) {}

	/** `null` when not found */
	private async request(
		path: string,
		query: Record<string, string> = {},
	): Promise<Maybe<unknown>> {
		const url = new URL(path, this.config.url);
		for (const [key, value] of Object.entries(query)) {
			url.searchParams.set(key, value);
		}

		const response = await this.fetch(url.toString(), {
			headers: { accept: "application/json" },
		});
		if (response.status === 404) {
			await response.body?.cancel();
			return null;
		}
		if (!response.ok) {
			throw new IndexExternalDclRequestError(
				path,
				response.status,
				await response.text(),
			);
		}

		return await response.json();
	}

	private async required<A, I>(
		schema: Schema.Schema<A, I>,
		path: string,
		query?: Record<string, string>,
	): Promise<A> {
		const body = await this.request(path, query);
		if (isNone(body)) {
			throw new IndexExternalDclRequestError(path, 404, "");
		}

		return Schema.decodeUnknownSync(schema)(body);
	}

	/** latest block height */
	async height(): Promise<number> {
		return (
			await this.required(
				Height,
				"/cosmos/base/tendermint/v1beta1/blocks/latest",
			)
		).block.header.height;
	}

	private async *list(path: string, field: string): AsyncIterable<unknown> {
		let key: Maybe<string> = null;
		do {
			const body: unknown = await this.required(Schema.Unknown, path, {
				"pagination.limit": String(PAGE),
				...(isNone(key) ? {} : { "pagination.key": key }),
			});

			const items = (body as Record<string, unknown>)[field];
			if (Array.isArray(items)) {
				yield* items;
			}

			key = Schema.decodeUnknownSync(Page)(body).pagination?.next_key ?? null;
		} while (key !== null && key !== "");
	}

	vendors(): AsyncIterable<unknown> {
		return this.list("/dcl/vendorinfo/vendors", "vendorInfo");
	}

	models(): AsyncIterable<unknown> {
		return this.list("/dcl/model/models", "model");
	}

	compliance(): AsyncIterable<unknown> {
		return this.list("/dcl/compliance/compliance-info", "complianceInfo");
	}

	/** software versions of a model, versions can't be listed all at once */
	async versions(vid: number, pid: number): Promise<readonly number[]> {
		const body = await this.request(`/dcl/model/versions/${vid}/${pid}`);
		return isNone(body)
			? []
			: Schema.decodeUnknownSync(Versions)(body).modelVersions.softwareVersions;
	}

	/** `null` when the entry doesn't exist (anymore) */
	async get(key: IndexExternalDclKey): Promise<Maybe<unknown>> {
		let path: string;
		let field: string;
		switch (key.kind) {
			case "vendor":
				path = `/dcl/vendorinfo/vendors/${key.vendorID}`;
				field = "vendorInfo";
				break;
			case "model":
				path = `/dcl/model/models/${key.vid}/${key.pid}`;
				field = "model";
				break;
			case "model-version":
				path = `/dcl/model/versions/${key.vid}/${key.pid}/${key.softwareVersion}`;
				field = "modelVersion";
				break;
			case "compliance":
				path = `/dcl/compliance/compliance-info/${key.vid}/${key.pid}/${key.softwareVersion}/${encodeURIComponent(key.certificationType)}`;
				field = "complianceInfo";
				break;
		}

		const body = await this.request(path);
		return isNone(body)
			? null
			: ((body as Record<string, unknown>)[field] ?? null);
	}

	/**
	 * keys of entries touched by successful transactions past height `after`, newest first and possibly repeated
	 *
	 * the rest interface doesn't filter by height ranges → walks ledger transactions backwards until reaching `after`
	 */
	async *touched(after: number): AsyncIterable<IndexExternalDclKey> {
		for (let page = 1; ; page++) {
			const { tx_responses: txs, total } = await this.required(
				Txs,
				"/cosmos/tx/v1beta1/txs",
				{
					events: "message.module='distributedcomplianceledger'",
					// descending, transactions arriving meanwhile shift pages → seen again rather than skipped
					order_by: "2",
					// the node ignores `pagination.*` for transactions
					page: String(page),
					limit: String(PAGE),
				},
			);

			let reached = false;
			for (const tx of txs ?? []) {
				if (tx.height <= after) {
					reached = true;
					continue;
				}
				if (tx.code !== 0) {
					continue;
				}

				for (const message of tx.tx.body.messages) {
					const decoded = Schema.decodeUnknownEither(Message)(message);
					if (isLeft(decoded)) {
						continue;
					}

					// e.g. `/zigbeealliance.distributedcomplianceledger.model.MsgCreateModel`
					const segments = decoded.right["@type"].split(".");
					const key = keyed(segments.at(-2) ?? "", message);
					if (key !== null) {
						yield key;
					}
				}
			}

			if (reached || (txs ?? []).length === 0 || page * PAGE >= total) {
				return;
			}
		}
	}
}
