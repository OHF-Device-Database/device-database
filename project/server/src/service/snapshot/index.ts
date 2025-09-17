import { createType, inject } from "@lppedd/di-wise-neo";
import { isLeft } from "effect/Either";
import { Schema } from "effect/index";

import { logger as parentLogger } from "../../logger";
import { DateFromUnixTime } from "../../type/codec/date";
import { Integer } from "../../type/codec/integer";
import { now, type UnixTime } from "../../type/codec/unix-time";
import { Uuid, uuid } from "../../type/codec/uuid";
import { IDatabase } from "../database";
import { insertSnapshot } from "../database/query/shapshot";

import type { Maybe } from "../../type/maybe";

const logger = parentLogger.child({ label: "snapshot" });

export const SnapshotV0 = Schema.Struct({
	version: Schema.Literal("home-assistant:1"),
	home_assistant: Schema.String,
	devices: Schema.Array(
		Schema.Struct({
			integration: Schema.String,
			manufacturer: Schema.Union(Schema.String, Schema.Null),
			model_id: Schema.Union(Schema.String, Schema.Null),
			model: Schema.Union(Schema.String, Schema.Null),
			sw_version: Schema.Union(Schema.String, Schema.Null),
			hw_version: Schema.Union(Schema.String, Schema.Null),
			has_configuration_url: Schema.Boolean,
			via_device: Schema.Union(Integer, Schema.Null),
			entry_type: Schema.Union(Schema.Literal("service"), Schema.Null),
			is_custom_integration: Schema.Boolean,
		}),
	),
});

const SnapshotV1Entity = Schema.Struct({
	assumed_state: Schema.Union(Schema.Boolean, Schema.Null),
	capabilities: Schema.Union(
		Schema.Struct({
			min: Schema.Number,
			max: Schema.Number,
			step: Schema.Number,
			mode: Schema.String,
		}),
		Schema.Struct({}),
		Schema.Null,
	),
	domain: Schema.String,
	entity_category: Schema.Union(Schema.String, Schema.Null),
	has_entity_name: Schema.Boolean,
	original_device_class: Schema.Union(Schema.String, Schema.Null),
	unit_of_measurement: Schema.Union(Schema.String, Schema.Null),
});

export const SnapshotV1 = Schema.Struct({
	version: Schema.Literal("home-assistant:1"),
	home_assistant: Schema.String,
	integrations: Schema.Record({
		key: Schema.String,
		value: Schema.Struct({
			devices: Schema.Array(
				Schema.Struct({
					entities: Schema.Array(SnapshotV1Entity),
					entry_type: Schema.Union(Schema.String, Schema.Null),
					has_configuration_url: Schema.Boolean,
					hw_version: Schema.Union(Schema.String, Schema.Null),
					manufacturer: Schema.Union(Schema.String, Schema.Null),
					model_id: Schema.Union(Schema.String, Schema.Null),
					model: Schema.Union(Schema.String, Schema.Null),
					sw_version: Schema.Union(Schema.String, Schema.Null),
					via_device: Schema.Union(
						Schema.Tuple(Schema.String, Integer),
						Schema.Null,
					),
				}),
			),
			entities: Schema.Array(SnapshotV1Entity),
			is_custom_integration: Schema.optional(Schema.Boolean),
		}),
	}),
});

const SnapshotContact = Schema.TemplateLiteral(
	Schema.String,
	Schema.Union(
		Schema.Literal("openhomefoundation.org"),
		Schema.Literal("nabucasa.com"),
	),
);

export const SnapshotSnapshot = Schema.extend(
	Schema.Struct({
		id: Uuid,
		contact: SnapshotContact,
		createdAt: DateFromUnixTime,
	}),
	Schema.Union(
		Schema.Struct({ version: Schema.Literal(0), data: SnapshotV0 }),
		Schema.Struct({ version: Schema.Literal(1), data: SnapshotV1 }),
	),
);
export type SnapshotSnapshot = typeof SnapshotSnapshot.Type;

export const SnapshotImportSnapshot = Schema.Struct({
	contact: SnapshotContact,
	data: Schema.Unknown,
});
type SnapshotImportSnapshot = typeof SnapshotImportSnapshot.Type;

type SnapshotImportSnapshotInserting = {
	id: Uuid;
	version: number;
	data: unknown;
	contact: string;
	createdAt: UnixTime;
};

export interface ISnapshot {
	import(snapshot: SnapshotImportSnapshot): Promise<Maybe<SnapshotSnapshot>>;
}

export const ISnapshot = createType<ISnapshot>("ISnapshot");

export class Snapshot implements ISnapshot {
	constructor(private db = inject(IDatabase)) {}

	async import(
		snapshot: SnapshotImportSnapshot,
	): Promise<Maybe<SnapshotSnapshot>> {
		let version;
		version: {
			{
				const guard = Schema.is(SnapshotV1);
				if (guard(snapshot.data)) {
					version = 1;
					break version;
				}
			}

			{
				const guard = Schema.is(SnapshotV0);
				if (guard(snapshot.data)) {
					version = 0;
					break version;
				}
			}

			// log out the decoding error
			// TODO: remove and send to slack instead
			{
				const decode = Schema.decodeUnknownEither(SnapshotV1);
				const decoded = decode(snapshot.data, { errors: "all" });
				if (isLeft(decoded)) {
					logger.warn("schema v1 decode failed");
					console.warn(decoded.left.message);
				}
			}

			{
				const decode = Schema.decodeUnknownEither(SnapshotV0);
				const decoded = decode(snapshot.data, { errors: "all" });
				if (isLeft(decoded)) {
					logger.warn("schema v0 decode failed");
					console.warn(decoded.left.message);
				}
			}

			version = -1;
		}

		const inserting: SnapshotImportSnapshotInserting = {
			id: uuid(),
			version,
			data: snapshot.data,
			contact: snapshot.contact,
			createdAt: now(),
		};
		const bound = insertSnapshot.bind.named({
			...inserting,
			data: JSON.stringify(inserting.data),
		});

		const result = await this.db.run(bound);

		const guard = Schema.is(SnapshotSnapshot);
		if (!guard(result)) {
			// possibly malformed snapshot
			return null;
		}

		return result;
	}
}
