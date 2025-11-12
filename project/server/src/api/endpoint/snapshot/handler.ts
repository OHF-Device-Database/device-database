import { pipeline, Readable, type TransformCallback } from "node:stream";

import { addHours } from "date-fns";
import { Schema } from "effect";
import Parser from "stream-json/Parser";
import StreamBase from "stream-json/streamers/StreamBase";
import type { ReadonlyDeep } from "type-fest";

import {
	SnapshotAttachableDevice,
	SnapshotAttachableEntity,
	type SnapshotVoucher,
} from "../../../service/snapshot";
import { Voucher } from "../../../service/voucher";
import { isNone, isSome } from "../../../type/maybe";
import { effectfulSinkEndpoint } from "../../base";

import type { components } from "../../../schema";
import type { Dependency } from "../../dependency";

// https://github.com/uhop/stream-json/issues/174
class StreamTransform extends StreamBase {
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by `StreamBase` internals
	private _level: number;
	// biome-ignore lint/suspicious/noExplicitAny: also unconstrained in library
	private _lastKey: any;

	static make(options?: StreamBase.StreamOptions) {
		return new StreamTransform(options);
	}

	constructor(options?: StreamBase.StreamOptions) {
		super(options);
		// used by `StreamBase` internals
		this._level = 2;
		this._lastKey = null;
	}

	// biome-ignore lint/suspicious/noExplicitAny: also unconstrained in library
	_wait(chunk: any, _: BufferEncoding, callback: TransformCallback) {
		if (chunk.name !== "startObject") {
			return callback(new Error("top-level object should be an object."));
		}
		this._transform = this._filter;
		return this._transform(chunk, _, callback);
	}

	_push(discard: boolean) {
		if (this._lastKey === null) {
			this._lastKey = this._assembler.key;
		} else {
			if (!discard) {
				this.push([
					// integration
					this._assembler.path[0],
					{
						key: this._lastKey,
						value: this._assembler.current[this._lastKey],
					},
				]);
			}
			this._assembler.current = {};
			this._lastKey = null;
		}
	}
}

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"user-agent": Schema.String.pipe(Schema.pattern(/^home-assistant:.+/)),
		"x-device-database-submission-identifier": Schema.optional(Schema.String),
	}),
});

const Device = Schema.Struct({
	...SnapshotAttachableDevice.fields,
	entities: Schema.Array(SnapshotAttachableEntity),
});
const validateDevices = Schema.is(
	Schema.Struct({
		key: Schema.Literal("devices"),
		value: Schema.Array(Device),
	}),
);
{
	type Actual = typeof Device.Type;
	type Wanted = ReadonlyDeep<components["schemas"]["SnapshotV1Device"]>;

	type Assert = Actual extends Wanted ? "yes" : "no";
	const _: Assert = "yes";
}

const Entity = SnapshotAttachableEntity;
const validateEntities = Schema.is(
	Schema.Struct({
		key: Schema.Literal("entities"),
		value: Schema.Array(Entity),
	}),
);
{
	type Actual = typeof Entity.Type;
	type Wanted = components["schemas"]["SnapshotV1Entity"];

	type Assert = Actual extends Wanted ? "yes" : "no";
	const _: Assert = "yes";
}

export const postSnapshot1 = (d: Pick<Dependency, "snapshot">) =>
	effectfulSinkEndpoint(
		"/api/v1/snapshot/1",
		"post",
		Parameters,
		"application/json",
		async (parameters, requestBody) => {
			const submissionIdentifier =
				parameters.header["x-device-database-submission-identifier"];
			const hassVersion = parameters.header["user-agent"].replace(
				"home-assistant:",
				"",
			);

			let voucher: SnapshotVoucher;
			if (typeof submissionIdentifier !== "undefined") {
				const deserialized =
					d.snapshot.voucher.deserialize(submissionIdentifier);

				if (deserialized.kind === "success") {
					voucher = deserialized.voucher;
				} else {
					return {
						code: 400,
						body: {
							kind: "malformed-submission",
							message: "malformed submission",
						},
					} as const;
				}
			} else {
				voucher = d.snapshot.voucher.create(new Date());
			}

			const { sub } = Voucher.peek(voucher);

			const handle = await d.snapshot.create(voucher, hassVersion);

			if (isNone(handle)) {
				// TODO: agree on error
				return { code: 500, body: "already submitted" } as const;
			}

			const { promise, resolve, reject } = Promise.withResolvers<void>();
			const chained = pipeline(
				Readable.fromWeb(requestBody),
				new Parser(),
				StreamTransform.make(),
				(err) => {
					// typing doesn't capture it, but `undefined` also indicates successful
					// pipeline completion
					if (isSome(err) && typeof err !== "undefined") {
						reject(err);
					} else {
						resolve();
					}
				},
			);

			for await (const [integration, item] of chained) {
				if (validateDevices(item)) {
					for (const device of item.value) {
						await d.snapshot.attach.device(
							handle,
							integration,
							device,
							device.entities,
						);
					}
				} else if (validateEntities(item)) {
					for (const entity of item.value) {
						await d.snapshot.attach.entity(handle, integration, entity);
					}
				}
			}

			await promise;

			await d.snapshot.finalize(handle);

			return {
				code: 200,
				body: {
					submission_identifier: d.snapshot.voucher.serialize(
						d.snapshot.voucher.create(addHours(new Date(), 22), sub),
					),
				},
			} as const;
		},
	);
