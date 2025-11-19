import { pipeline, Readable, type TransformCallback } from "node:stream";

import { addHours } from "date-fns";
import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { ArrayFormatter } from "effect/ParseResult";
import Parser from "stream-json/Parser";
import StreamBase from "stream-json/streamers/StreamBase";
import type { ReadonlyDeep } from "type-fest";

import { logger as parentLogger } from "../../../logger";
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

const logger = parentLogger.child({ label: "snapshot-v1" });

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

const validatePart = Schema.is(
	Schema.Tuple(
		Schema.String,
		Schema.Struct({
			key: Schema.Union(Schema.Literal("devices"), Schema.Literal("entities")),
			value: Schema.Array(Schema.Unknown),
		}),
	),
);

const Device = Schema.Struct({
	...SnapshotAttachableDevice.fields,
	entities: Schema.Array(SnapshotAttachableEntity),
});
const validateDevice = Schema.is(Device);
const decodeDevice = Schema.decodeUnknownEither(Device);
{
	type Actual = typeof Device.Type;
	type Wanted = ReadonlyDeep<components["schemas"]["SnapshotV1Device"]>;

	type Assert = Actual extends Wanted ? "yes" : "no";
	const _: Assert = "yes";
}

const Entity = SnapshotAttachableEntity;
const validateEntity = Schema.is(Entity);
const decodeEntity = Schema.decodeUnknownEither(Entity);
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

			const { id, sub } = Voucher.peek(voucher);

			const handle = await d.snapshot.create(voucher, hassVersion);

			if (isNone(handle)) {
				// TODO: agree on error
				return { code: 500, body: "already submitted" } as const;
			}

			const chained = pipeline(
				Readable.fromWeb(requestBody),
				new Parser(),
				StreamTransform.make(),
				// callback needs to be provided for non-async `pipeline`
				// non-async pipeline is desireable, as async variant awaits until stream concludes
				// as processing the stream happens below, that is undesirable
				(err) => {
					// typing doesn't capture it, but `undefined` also indicates successful
					// pipeline completion
					if (isSome(err) && typeof err !== "undefined") {
						logger.warn("stream processing error", {
							message: "message" in err ? err.message : "unknown error",
						});
					}
				},
				// attaching a callback *does not* suppress "error" emits
				// the `for await` below still rejects (and consequently throws) properly in the case of an error
			);

			try {
				for await (const part of chained) {
					if (!validatePart(part)) {
						continue;
					}

					const [integration, entry] = part;
					switch (entry.key) {
						case "devices": {
							for (const device of entry.value) {
								// validation is cheaper than decoding → try validation first, and
								// only decode in case of an error
								if (validateDevice(device)) {
									await d.snapshot.attach.device(
										handle,
										integration,
										device,
										device.entities,
									);
								} else {
									const decoded = decodeDevice(device);
									if (isLeft(decoded)) {
										logger.warn(`submission <${id}> → malformed device`, {
											submissionId: id,
											subject: sub,
											error: ArrayFormatter.formatErrorSync(decoded.left),
										});
									}
								}
							}
							break;
						}
						case "entities": {
							for (const entity of entry.value) {
								// validation is cheaper than decoding → try validation first, and
								// only decode in case of an error
								if (validateEntity(entity)) {
									await d.snapshot.attach.entity(handle, integration, entity);
								} else {
									const decoded = decodeEntity(entity);
									if (isLeft(decoded)) {
										logger.warn(`submission <${id}> → malformed entity`, {
											submissionId: id,
											subject: sub,
											error: ArrayFormatter.formatErrorSync(decoded.left),
										});
									}
								}
							}
							break;
						}
					}
				}
			} catch {
				return {
					code: 400,
					body: {
						kind: "malformed-submission",
						message: "malformed submission",
					},
				} as const;
			}

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
