import { createHash } from "node:crypto";
import {
	pipeline,
	type Readable,
	Transform,
	type TransformCallback,
} from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import type { ParseError } from "effect/ParseResult";
import Parser from "stream-json/Parser";
import StreamBase from "stream-json/streamers/StreamBase";
import type { ReadonlyDeep } from "type-fest";

import { isSome } from "../../type/maybe";
import { commutativeHash } from "../../utility/commutative-hash";
import { cyclicNodes } from "../../utility/cyclic-dfs";
import { HintedEventEmitter } from "../../utility/hinted-event-emitter";
import { omit } from "../../utility/omit";
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
type OutDevice = typeof OutDevice.Type;

const OutEntity = Schema.Struct({
	integration: Schema.String,
	entity: SnapshotAttachableEntity,
});
type OutEntity = typeof OutEntity.Type;

export const SnapshotRequestTransformOut = Schema.Union(OutDevice, OutEntity);
export type SnapshotRequestTransformOut =
	typeof SnapshotRequestTransformOut.Type;

class SizeMeasureTransform extends Transform {
	private size = 0;

	constructor() {
		super({ objectMode: false });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.push(chunk);
		this.size += chunk.length;
		callback();
	}

	_final(callback: (error?: Error | null) => void): void {
		this.emit("size", this.size);
		callback();
	}
}

type Link = {
	child: Buffer<ArrayBufferLike>;
	parent: {
		integration: string;
		offset: number;
	};
};

type Dereferenced = {
	/** child hash → parent hashes */
	dereferenced: Map<string, Set<string>>;
	/** links to devices that were not included in snapshot / excluded because they were malformed */
	dangling: [integration: string, offset: number][];
	/** devices that directly or linked to themselves */
	circular: [integration: string, offset: number][];
};

export type SnapshotRequestTransformHash = {
	version: 1;
	hash: Buffer<ArrayBufferLike>;
};

export type SnapshotRequestTransformDevice = OutDevice & {
	hash: Buffer<ArrayBufferLike>;
};
export type SnapshotRequestTransformEntity = OutEntity;
export type SnapshotRequestTransformMalformedDevice = {
	integration: string;
	device: unknown;
	error: ParseError;
};
export type SnapshotRequestTransformEmptyDevice = {
	integration: string;
	device: unknown;
};
export type SnapshotRequestTransformMalformedEntity = {
	integration: string;
	entity: unknown;
	error: ParseError;
};
export type SnapshotRequestTransformMalformedLink = {
	kind: "dangling" | "circular";
	integration: string;
	offset: number;
};
type Event = {
	device: SnapshotRequestTransformDevice;
	entity: SnapshotRequestTransformEntity;
	"malformed-device": SnapshotRequestTransformMalformedDevice;
	"malformed-entity": SnapshotRequestTransformMalformedEntity;
	"malformed-link": SnapshotRequestTransformMalformedLink;
};

export class SnapshotRequestTransform extends HintedEventEmitter<Event>()(
	Transform,
) {
	// integration → base64-encoded device hashes
	// not using `Set` to preserve duplicates, and therefor offsets, which are needed for link dereferencing
	private hashes: Map<string, Buffer<ArrayBufferLike>[]> = new Map();
	private links: Link[] = [];

	constructor() {
		super({ objectMode: true });
	}

	override push(chunk: OutDevice | OutEntity | null): boolean {
		// only hash devices, as integration entities aren't persisted anymore
		if (isSome(chunk)) {
			if ("device" in chunk) {
				const hash = createHash("sha256");

				hash.update(chunk.integration);
				hash.update(String(chunk.device.manufacturer));
				hash.update(String(chunk.device.model));
				hash.update(String(chunk.device.model_id));
				hash.update(String(chunk.device.entry_type));
				hash.update(String(chunk.device.has_configuration_url));
				hash.update(String(chunk.device.sw_version));
				hash.update(String(chunk.device.hw_version));

				// coerce all fields to strings for deterministic ordering more convenient hashing
				const coercedEntities = chunk.entities.map((e) => ({
					...e,
					assumed_state: String(e.assumed_state),
					domain: e.domain,
					entity_category: String(e.entity_category),
					has_entity_name: String(e.has_entity_name),
					original_device_class: String(e.original_device_class),
					unit_of_measurement: String(e.unit_of_measurement),
				}));

				for (const entity of coercedEntities.toSorted(
					(a, b) =>
						a.domain.localeCompare(b.domain) ||
						a.entity_category.localeCompare(b.entity_category) ||
						a.original_device_class.localeCompare(b.original_device_class) ||
						a.has_entity_name.localeCompare(b.has_entity_name) ||
						a.assumed_state.localeCompare(b.assumed_state) ||
						a.unit_of_measurement.localeCompare(b.unit_of_measurement),
				)) {
					hash.update(entity.domain);
					hash.update(entity.entity_category);
					hash.update(entity.original_device_class);
					hash.update(entity.has_entity_name);
					hash.update(entity.assumed_state);
					hash.update(entity.unit_of_measurement);
				}

				const digest = hash.digest();

				// order of devices is not guaranteed, which can affect device link offsets → dereference them later
				if (isSome(chunk.device.via_device)) {
					this.links.push({
						child: digest,
						parent: {
							integration: chunk.device.via_device[0],
							offset: chunk.device.via_device[1],
						},
					});
				}

				const bucket = this.hashes.get(chunk.integration);
				if (typeof bucket === "undefined") {
					this.hashes.set(chunk.integration, [digest]);
				} else {
					bucket.push(digest);
				}

				this._emit("device", { ...chunk, hash: digest });
			} else if ("entity" in chunk) {
				this._emit("entity", chunk);
			}
		}

		return super.push(chunk);
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
							const out: OutDevice = {
								integration,
								device: omit(device, "entities"),
								entities: device.entities,
							};

							this.push(out);
						} else {
							const decoded = decodeDevice(device);
							if (isLeft(decoded)) {
								this._emit("malformed-device", {
									integration,
									device,
									error: decoded.left,
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
								this._emit("malformed-entity", {
									integration,
									entity,
									error: decoded.left,
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

	private dereferenced(): Dereferenced {
		const dereferenced: Dereferenced["dereferenced"] = new Map();
		const dangling: Dereferenced["dangling"] = [];
		const circular: Dereferenced["circular"] = [];

		for (const { child: hashChild, parent } of this.links) {
			const hashParent = this.hashes.get(parent.integration)?.at(parent.offset);
			// referenced device that wasn't part of snapshot
			if (typeof hashParent === "undefined") {
				dangling.push([parent.integration, parent.offset]);
				continue;
			}

			const hashChildEncoded = hashChild.toString("base64");
			const hashParentEncoded = hashParent.toString("base64");

			const bucket = dereferenced.get(hashChildEncoded);
			if (typeof bucket === "undefined") {
				dereferenced.set(hashChildEncoded, new Set([hashParentEncoded]));
			} else {
				bucket.add(hashParentEncoded);
			}
		}

		// detect circular links (direct and indirect) via depth-first search
		const circularLinks = cyclicNodes(dereferenced);

		// remove circular entries from dereferenced and collect their link info
		for (const { child: hashChild, parent } of this.links) {
			const hashChildEncoded = hashChild.toString("base64");

			if (circularLinks.has(hashChildEncoded)) {
				circular.push([parent.integration, parent.offset]);
				dereferenced.delete(hashChildEncoded);
			}
		}

		return { dereferenced, dangling, circular };
	}

	/** hash of already transformed chunks */
	public hash(): SnapshotRequestTransformHash {
		const { update, digest } = commutativeHash("sha256");

		// devices
		{
			const encountered: Set<string> = new Set();
			for (const hashes of this.hashes.values()) {
				for (const hash of hashes) {
					const hashEncoded = hash.toString("base64");

					// device permutation attribution only considers presence, not cardinality → deduplicate
					if (encountered.has(hashEncoded)) {
						continue;
					}

					update(hash);

					encountered.add(hashEncoded);
				}
			}
		}

		// device links
		// devices that are hash-identical can still reference different parents
		// these relationships are captured in attribution table (exactly once), and are therefor part of hash
		for (const [hashChild, hashParents] of this.dereferenced().dereferenced) {
			update(hashChild);

			for (const hashParent of hashParents) {
				update(hashParent);
			}
		}

		return { version: 1, hash: digest() };
	}

	_final(callback: (error?: Error | null) => void): void {
		const { dangling, circular } = this.dereferenced();

		for (const item of dangling) {
			this._emit("malformed-link", {
				kind: "dangling",
				integration: item[0],
				offset: item[1],
			});
		}

		for (const item of circular) {
			this._emit("malformed-link", {
				kind: "circular",
				integration: item[0],
				offset: item[1],
			});
		}

		callback();
	}
}

export const stream = (source: Readable): SnapshotRequestTransform => {
	const sizeMeasure = new SizeMeasureTransform();

	const stream = pipeline(
		source,
		sizeMeasure,
		new Parser(),
		StreamTransform.make(),
		new SnapshotRequestTransform(),
		// callback needs to be provided for non-async `pipeline`
		// non-async pipeline is desirable, as async variant awaits until stream concludes
		() => {
			// attaching a callback is required, but it *does not* suppress "error" emits
			// e.g. `for await` consumption still rejects (and consequently throws) properly in the case of an error
		},
	);

	sizeMeasure.once("size", (s) => {
		stream.emit("size", s);
	});

	return stream;
};
