import { createType, inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect";
import { isRight } from "effect/Either";

import { DateFromUnixTime } from "../../type/codec/date";
import { Integer } from "../../type/codec/integer";
import { now, type UnixTime } from "../../type/codec/unix-time";
import { Uuid, uuid } from "../../type/codec/uuid";
import { unroll } from "../../utility/iterable";
import { IDatabase } from "../database";
import {
	getUnexpectedSnapshots,
	insertSnapshot,
	updateSnapshotVersion,
} from "../database/query/shapshot";
import { IDispatch } from "../dispatch";
import { ISignal } from "../signal";

export const SnapshotV0 = Schema.Struct({
	version: Schema.Literal("home-assistant:1"),
	home_assistant: Schema.String,
	devices: Schema.Array(
		Schema.Struct({
			integration: Schema.String,
			manufacturer: Schema.Union(Schema.String, Schema.Null),
			model_id: Schema.Union(Schema.String, Schema.Null),
			model: Schema.Union(Schema.String, Schema.Null),
			sw_version: Schema.Union(
				Schema.String,
				Schema.Number,
				Schema.Null,
				Schema.Array(Schema.String),
			),
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
					sw_version: Schema.Union(
						Schema.String,
						Schema.Number,
						Schema.Null,
						Schema.Array(Schema.String),
					),
					via_device: Schema.Union(
						Schema.Tuple(Schema.String, Integer),
						Schema.Null,
					),
				}),
			),
			entities: Schema.Array(SnapshotV1Entity),
			is_custom_integration: Schema.Union(Schema.Boolean, Schema.Null),
		}),
	}),
});

const SnapshotV2Entity = Schema.Struct({
	assumed_state: Schema.Union(Schema.Boolean, Schema.Null),
	domain: Schema.String,
	entity_category: Schema.Union(Schema.String, Schema.Null),
	has_entity_name: Schema.Boolean,
	original_device_class: Schema.Union(Schema.String, Schema.Null),
	unit_of_measurement: Schema.Union(Schema.String, Schema.Null),
});

export const SnapshotV2 = Schema.Struct({
	version: Schema.Literal("home-assistant:1"),
	home_assistant: Schema.String,
	integrations: Schema.Record({
		key: Schema.String,
		value: Schema.Struct({
			devices: Schema.Array(
				Schema.Struct({
					entities: Schema.Array(SnapshotV2Entity),
					entry_type: Schema.Union(Schema.String, Schema.Null),
					has_configuration_url: Schema.Boolean,
					hw_version: Schema.Union(Schema.String, Schema.Null),
					manufacturer: Schema.Union(Schema.String, Schema.Null),
					model_id: Schema.Union(Schema.String, Schema.Null),
					model: Schema.Union(Schema.String, Schema.Null),
					sw_version: Schema.Union(
						Schema.String,
						Schema.Number,
						Schema.Null,
						Schema.Array(Schema.String),
					),
					via_device: Schema.Union(
						Schema.Tuple(Schema.String, Integer),
						Schema.Null,
					),
				}),
			),
			entities: Schema.Array(SnapshotV2Entity),
			is_custom_integration: Schema.Undefined,
		}),
	}),
});

export const schemas: [
	version: number,
	// biome-ignore lint/suspicious/noExplicitAny: purposeful erasure
	schema: Schema.Schema<any, any, never>,
][] = [
	[2, SnapshotV2],
	[1, SnapshotV1],
	[0, SnapshotV0],
];

export const SnapshotContact = Schema.TemplateLiteral(
	Schema.String,
	Schema.Union(
		Schema.Literal("openhomefoundation.org"),
		Schema.Literal("nabucasa.com"),
	),
);
export type SnapshotContact = typeof SnapshotContact.Type;

const SnapshotSnapshotVersionedData = Schema.Union(
	Schema.Struct({
		version: Schema.Literal(-1),
		data: Schema.parseJson(Schema.Struct({})),
	}),
	Schema.Struct({
		version: Schema.Literal(0),
		data: Schema.parseJson(SnapshotV0),
	}),
	Schema.Struct({
		version: Schema.Literal(1),
		data: Schema.parseJson(SnapshotV1),
	}),
	Schema.Struct({
		version: Schema.Literal(2),
		data: Schema.parseJson(SnapshotV2),
	}),
);

export const SnapshotSnapshot = Schema.extend(
	Schema.Struct({
		id: Uuid,
		contact: SnapshotContact,
		createdAt: DateFromUnixTime,
	}),
	SnapshotSnapshotVersionedData,
);
export type SnapshotSnapshot = typeof SnapshotSnapshot.Type;

export const SnapshotImportSnapshot = Schema.Struct({
	contact: SnapshotContact,
	data: Schema.Unknown,
});
export type SnapshotImportSnapshot = typeof SnapshotImportSnapshot.Type;

type SnapshotImportSnapshotInserting = {
	id: Uuid;
	version: number;
	data: unknown;
	contact: string;
	createdAt: UnixTime;
};

export interface ISnapshot {
	import(snapshot: SnapshotImportSnapshot): Promise<SnapshotSnapshot>;
	reexamine(): Promise<void>;
}

export const ISnapshot = createType<ISnapshot>("ISnapshot");

export class Snapshot implements ISnapshot {
	constructor(
		private db = inject(IDatabase),
		private dispatch = inject(IDispatch),
		private signal = inject(ISignal),
	) {}

	async import(snapshot: SnapshotImportSnapshot): Promise<SnapshotSnapshot> {
		let version: number | undefined;
		for (const [schemaVersion, schema] of schemas) {
			// `is_custom_integration` has to be undefined in v2
			const guard = Schema.is(schema, { exact: false });
			if (guard(snapshot.data)) {
				version = schemaVersion;
				break;
			}
		}

		const inserting: SnapshotImportSnapshotInserting = {
			id: uuid(),
			version: version ?? -1,
			data: snapshot.data,
			contact: snapshot.contact,
			createdAt: now(),
		};
		const bound = insertSnapshot.bind.named({
			...inserting,
			data: JSON.stringify(inserting.data),
		});

		const result = await this.db.run(bound);

		const decoded = Schema.decodeUnknownSync(SnapshotSnapshot)(result);

		this.dispatch.now(() =>
			this.signal.send({
				kind: "submission",
				context: {
					id: decoded.id,
					contact: decoded.contact,
					version,
				},
			}),
		);

		return decoded;
	}

	async reexamine(): Promise<void> {
		const bound = getUnexpectedSnapshots.bind.anonymous([]);
		const unexpected = await unroll(this.db.run(bound));

		const expected = Schema.Struct({
			id: Uuid,
			data: Schema.String,
		});
		const guard = Schema.is(expected);

		for (const snapshot of unexpected) {
			/* node:coverage disable */
			if (!guard(snapshot)) {
				continue;
			}
			/* node:coverage enable */

			let version: number | undefined;
			for (const [schemaVersion, schema] of schemas) {
				const decode = Schema.decodeUnknownEither(Schema.parseJson(schema), {
					// `is_custom_integration` has to be undefined in v2
					exact: false,
				});

				const decoded = decode(snapshot.data);
				if (isRight(decoded)) {
					version = schemaVersion;
					break;
				}
			}

			/* node:coverage disable */
			if (typeof version === "undefined") {
				continue;
			}
			/* node:coverage enable */

			const bound = updateSnapshotVersion.bind.named({
				id: snapshot.id,
				version,
			});
			await this.db.run(bound);
		}
	}
}
