import { Inject, Injectable } from "@nestjs/common";

import { logger as parentLogger } from "../../../../logger";
import {
	deleteExternalDclCompliance,
	deleteExternalDclComplianceAll,
	deleteExternalDclModel,
	deleteExternalDclModelAll,
	deleteExternalDclModelVersion,
	deleteExternalDclModelVersionAll,
	deleteExternalDclModelVersionByModel,
	deleteExternalDclVendor,
	deleteExternalDclVendorAll,
} from "../../../../service/database/query/index/external-dcl-delete";
import { getExternalDclSync } from "../../../../service/database/query/index/external-dcl-get";
import {
	insertExternalDclCompliance,
	insertExternalDclModel,
	insertExternalDclModelVersion,
	insertExternalDclSync,
	insertExternalDclVendor,
} from "../../../../service/database/query/index/external-dcl-insert";
import { isNone, isSome, type Maybe } from "../../../../type/maybe";
import { DatabaseIndex } from "../../../database/database.module";
import {
	IndexExternalDcl,
	type IndexExternalDclKey,
	keyed,
} from "./dcl.client";

import type { IDatabase } from "../../../../service/database";

const logger = parentLogger.child({ label: "index-external-dcl" });

// models between progress logs while fetching versions
const PROGRESS = 100;

const IndexExternalDclLatestSealedSymbol = Symbol(
	"IndexExternalDclLatestSealedSymbol",
);
const IndexExternalDclPulledSealedSymbol = Symbol(
	"IndexExternalDclPulledSealedSymbol",
);

/** ledger height the tables reflect, `null` when not seeded */
type IndexExternalDclHeight = Maybe<number>;

export type IndexExternalDclLatest = Readonly<{
	[IndexExternalDclLatestSealedSymbol]: IndexExternalDclHeight;
}>;

type IndexExternalDclPulledInner = Readonly<{
	/** height pulling departed from */
	latest: IndexExternalDclHeight;
	/** height pulled up to */
	height: number;
	/** entries replace all present ones rather than updating them */
	replace: boolean;
	/** `null` value → entry no longer exists */
	entries: { key: IndexExternalDclKey; value: Maybe<unknown> }[];
}>;

/** ledger entries changed since latest, as fetched by {@link ServiceIndexExternalDcl.pull} */
export type IndexExternalDclPulled = Readonly<{
	[IndexExternalDclPulledSealedSymbol]: IndexExternalDclPulledInner;
}>;

@Injectable()
export class ServiceIndexExternalDcl {
	constructor(
		@Inject(DatabaseIndex) private readonly db: IDatabase<"index">,
		/** unconfigured → nothing to index */
		@Inject(IndexExternalDcl) private readonly dcl: Maybe<IndexExternalDcl>,
	) {}

	get configured(): boolean {
		return isSome(this.dcl);
	}

	/** walking the ledger from scratch takes too many requests, requires a seeded index */
	async available(): Promise<boolean> {
		return isSome(await this.db.run(getExternalDclSync.bind.anonymous([])));
	}

	/** brings tables up to the ledger's latest height, walks the ledger in its entirety when not seeded */
	async sync(): Promise<void> {
		while (true) {
			const pulled = await this.pull(await this.latest());
			if (isNone(pulled) || (await this.apply(pulled))) {
				return;
			}
		}
	}

	/** {@link apply} only proceeds while it remains the latest */
	async latest(): Promise<IndexExternalDclLatest> {
		return {
			[IndexExternalDclLatestSealedSymbol]:
				(await this.db.run(getExternalDclSync.bind.anonymous([])))?.height ??
				null,
		};
	}

	/** fetches entries changed past `latest`, `null` when there's nothing to apply */
	async pull(
		latest: IndexExternalDclLatest,
	): Promise<Maybe<IndexExternalDclPulled>> {
		const dcl = this.dcl;
		if (isNone(dcl)) {
			return null;
		}

		const inner = latest[IndexExternalDclLatestSealedSymbol];
		// taken upfront, entries changing while walking are picked up by the next pull
		const height = await dcl.height();

		if (isSome(inner)) {
			if (height <= inner) {
				logger.debug(`ledger index up to date at <${inner}>`, {
					latest: inner,
					height,
				});
				return null;
			}

			logger.debug(`pulling ledger changes <${inner}> → <${height}>`, {
				latest: inner,
				height,
			});

			const keys = new Map<string, IndexExternalDclKey>();
			for await (const key of dcl.touched(inner)) {
				keys.set(JSON.stringify(key), key);
			}

			logger.debug(`fetching <${keys.size}> touched ledger entries`, {
				count: keys.size,
			});

			const entries: IndexExternalDclPulledInner["entries"] = [];
			for (const key of keys.values()) {
				entries.push({ key, value: await dcl.get(key) });
			}

			return {
				[IndexExternalDclPulledSealedSymbol]: {
					latest: inner,
					height,
					replace: false,
					entries,
				},
			};
		}

		logger.debug(`walking ledger up to <${height}>`, { height });

		const entries: IndexExternalDclPulledInner["entries"] = [];
		for (const [module, values] of [
			["vendorinfo", dcl.vendors()],
			["model", dcl.models()],
			["compliance", dcl.compliance()],
		] as const) {
			const before = entries.length;
			for await (const value of values) {
				const key = keyed(module, value);
				if (isNone(key)) {
					logger.warn(`malformed <${module}> entry, skipped`, { value });
					continue;
				}

				entries.push({ key, value });
			}

			logger.debug(`listed <${entries.length - before}> <${module}> entries`, {
				module,
				count: entries.length - before,
			});
		}

		const models = entries.flatMap(({ key }) =>
			key.kind === "model" ? [key] : [],
		);
		for (const [i, key] of models.entries()) {
			if (i % PROGRESS === 0) {
				logger.debug(`fetching versions of models <${i}/${models.length}>`, {
					done: i,
					count: models.length,
				});
			}

			for (const softwareVersion of await dcl.versions(key.vid, key.pid)) {
				const version: IndexExternalDclKey = {
					kind: "model-version",
					vid: key.vid,
					pid: key.pid,
					softwareVersion,
				};
				entries.push({ key: version, value: await dcl.get(version) });
			}
		}

		logger.debug(
			`fetched versions of models <${models.length}/${models.length}>`,
			{
				done: models.length,
				count: models.length,
			},
		);

		return {
			[IndexExternalDclPulledSealedSymbol]: {
				latest: inner,
				height,
				replace: true,
				entries,
			},
		};
	}

	/**
	 * writes pulled entries
	 *
	 * `false` when the tables changed since pulling, nothing is written then
	 */
	async apply(pulled: IndexExternalDclPulled): Promise<boolean> {
		const { latest, height, replace, entries } =
			pulled[IndexExternalDclPulledSealedSymbol];

		const applied = await this.db.begin("w", async (t) => {
			const current = await t.run(getExternalDclSync.bind.anonymous([]));
			if ((current?.height ?? null) !== latest) {
				return false;
			}

			if (replace) {
				await t.run(deleteExternalDclVendorAll.bind.anonymous([]));
				await t.run(deleteExternalDclModelAll.bind.anonymous([]));
				await t.run(deleteExternalDclModelVersionAll.bind.anonymous([]));
				await t.run(deleteExternalDclComplianceAll.bind.anonymous([]));
			}

			for (const { key, value } of entries) {
				const json = JSON.stringify(value);
				switch (key.kind) {
					case "vendor":
						await t.run(
							isNone(value)
								? deleteExternalDclVendor.bind.named({
										vendorId: key.vendorID,
									})
								: insertExternalDclVendor.bind.named({ value: json }),
						);
						break;
					case "model":
						if (isNone(value)) {
							await t.run(deleteExternalDclModel.bind.named(key));
							await t.run(deleteExternalDclModelVersionByModel.bind.named(key));
						} else {
							await t.run(insertExternalDclModel.bind.named({ value: json }));
						}
						break;
					case "model-version":
						await t.run(
							isNone(value)
								? deleteExternalDclModelVersion.bind.named(key)
								: insertExternalDclModelVersion.bind.named({ value: json }),
						);
						break;
					case "compliance":
						await t.run(
							isNone(value)
								? deleteExternalDclCompliance.bind.named(key)
								: insertExternalDclCompliance.bind.named({ value: json }),
						);
						break;
				}
			}

			await t.run(
				insertExternalDclSync.bind.named({
					height,
					syncedAt: Math.floor(Date.now() / 1000),
				}),
			);

			return true;
		});

		if (!applied) {
			logger.info(`ledger index changed since pulling <${height}>, skipped`, {
				height,
				latest,
			});
			return false;
		}

		logger.info(
			`indexed <${entries.length}> ledger entries up to <${height}>`,
			{
				height,
				count: entries.length,
				replace,
			},
		);
		return true;
	}
}
