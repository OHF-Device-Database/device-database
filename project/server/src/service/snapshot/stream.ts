import {
	pipeline,
	type Readable,
	Transform,
	type TransformCallback,
} from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { ArrayFormatter } from "effect/ParseResult";
import Parser from "stream-json/Parser";
import StreamBase from "stream-json/streamers/StreamBase";
import type { ReadonlyDeep } from "type-fest";

import { SnapshotAttachableDevice, SnapshotAttachableEntity } from "./";

import type { components } from "../../schema";

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

const validatePart = Schema.is(
	Schema.Tuple(
		Schema.String,
		Schema.Struct({
			key: Schema.Union(Schema.Literal("devices"), Schema.Literal("entities")),
			value: Schema.Array(Schema.Unknown),
		}),
	),
);

const InDevice = Schema.Struct({
	...SnapshotAttachableDevice.fields,
	entities: Schema.Array(SnapshotAttachableEntity),
});
const validateDevice = Schema.is(InDevice);
const decodeDevice = Schema.decodeUnknownEither(InDevice);
{
	type Actual = typeof InDevice.Type;
	type Wanted = ReadonlyDeep<components["schemas"]["SnapshotV1Device"]>;

	type Assert = Actual extends Wanted ? "yes" : "no";
	const _: Assert = "yes";
}

const InEntity = SnapshotAttachableEntity;
const validateEntity = Schema.is(InEntity);
const decodeEntity = Schema.decodeUnknownEither(InEntity);
{
	type Actual = typeof InEntity.Type;
	type Wanted = components["schemas"]["SnapshotV1Entity"];

	type Assert = Actual extends Wanted ? "yes" : "no";
	const _: Assert = "yes";
}

const OutDevice = Schema.Struct({
	integration: Schema.String,
	device: SnapshotAttachableDevice,
	entities: Schema.Array(SnapshotAttachableEntity),
});

const OutEntity = Schema.Struct({
	integration: Schema.String,
	entity: SnapshotAttachableEntity,
});

export const SnapshotRequestTransformOut = Schema.Union(OutDevice, OutEntity);
export type SnapshotRequestTransformOut =
	typeof SnapshotRequestTransformOut.Type;

// `Transform` isn't generic 🥺
export class SnapshotRequestTransform extends Transform {
	constructor() {
		super({ objectMode: true });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		validate: {
			if (!validatePart(chunk)) {
				break validate;
			}

			const [integration, entry] = chunk;
			switch (entry.key) {
				case "devices": {
					for (const device of entry.value) {
						// validation is cheaper than decoding → try validation first, and
						// only decode in case of an error
						if (validateDevice(device)) {
							this.push({
								integration,
								device,
								entities: device.entities,
							});
						} else {
							const decoded = decodeDevice(device);
							if (isLeft(decoded)) {
								this.emit("malformed-device", {
									device,
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
							this.push({
								integration,
								entity,
							});
						} else {
							const decoded = decodeEntity(entity);
							if (isLeft(decoded)) {
								this.emit("malformed-entity", {
									entity,
									error: ArrayFormatter.formatErrorSync(decoded.left),
								});
							}
						}
					}
					break;
				}
			}
		}

		callback();
	}
}

export const stream = (source: Readable): SnapshotRequestTransform => {
	return pipeline(
		source,
		new Parser(),
		StreamTransform.make(),
		new SnapshotRequestTransform(),
		// callback needs to be provided for non-async `pipeline`
		// non-async pipeline is desireable, as async variant awaits until stream concludes
		() => {
			// attaching a callback is required, but it *does not* suppress "error" emits
			// e.g. `for await` consumption still rejects (and consequently throws) properly in the case of an error
		},
	);
};
