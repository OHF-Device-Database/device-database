import type { TransformCallback } from "node:stream";
import { pipeline, Readable, Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";

import {
	MetadataDirective,
	NoSuchKey,
	NotFound,
	paginateListObjectsV2,
	S3,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { ConfigProvider } from "../../../config";
import { logger as parentLogger } from "../../../logger";
import { isNone, type Maybe } from "../../../type/maybe";
import { LineSplitTransform } from "../../../utility/line-split-transform";
import { Voucher } from "../../voucher";
import { ISnapshot, Snapshot, type SnapshotVoucher } from "..";
import {
	type SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

import type { Uuid } from "../../../type/codec/uuid";
import type {
	ISnapshotDeferTarget,
	SnapshotDeferTargetDeferred,
	SnapshotDeferTargetDeferredSnapshot,
} from "./base";

const logger = parentLogger.child({
	label: "snapshot-defer-target-object-store",
});

class SnapshotDeferTargetObjectStoreTooFewTargetsError extends Error {
	constructor() {
		super("expected at least one target");
		Object.setPrototypeOf(
			this,
			SnapshotDeferTargetObjectStoreTooFewTargetsError.prototype,
		);
	}
}

class SnapshotDeferTargetObjectStoreMissingBodyError extends Error {
	constructor(key: string) {
		super(`object <${key}> was fetched without a body`);
		Object.setPrototypeOf(
			this,
			SnapshotDeferTargetObjectStoreMissingBodyError.prototype,
		);
	}
}

class NdJsonEncodeTransform extends Transform {
	constructor() {
		super({ readableObjectMode: false, writableObjectMode: true });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.push(JSON.stringify(chunk));
		this.push("\n");

		callback();
	}
}

class NdJsonDecodeTransform extends Transform {
	constructor() {
		super({ readableObjectMode: true, writableObjectMode: true });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.push(JSON.parse(chunk));

		callback();
	}
}

/** forwards a failure of the response to the wrapper the sdk layered on top of it
 *
 * the sdk replaces the response with a `ChecksumStream` whenever the object carries `x-amz-checksum-*` and links the two with `pipe`, which forwards neither teardown nor errors
 *
 * a response that dies mid-flight therefore leaves the wrapper waiting on bytes that will never arrive
 * this has so far been what a corrupted object looks like: a body shorter than its advertised `content-length`, followed by a reset
 */
export const bridgeFailure = (body: unknown): void => {
	if (!(body instanceof Readable)) {
		return;
	}

	const source: unknown = (body as { source?: unknown }).source;
	if (source instanceof Readable && source !== body) {
		source.once("error", (err: Error) => {
			body.destroy(err);
		});
	}
};

class SnapshotPersistedTransform extends Transform {
	private static validator = Schema.is(SnapshotRequestTransformOut);

	constructor() {
		super({ objectMode: true });
	}

	_transform(
		// biome-ignore lint/suspicious/noExplicitAny: `Transform` isn't constrained further
		chunk: any,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		if (SnapshotPersistedTransform.validator(chunk)) {
			this.push(chunk);
		}

		callback();
	}
}

const deferredPrefix = "submission";
const deferredBufferPrefix = "submission-buffer";
const archivePrefix = "submission-archive";
const deferredMaxPages = 4;

export class SnapshotDeferTargetObjectStore implements ISnapshotDeferTarget {
	private targets: { s3: S3; bucket: string }[];

	constructor(
		private snapshot = inject(ISnapshot),
		targets = inject(ConfigProvider)((c) => {
			const scoped = c.snapshot.defer.objectStore;

			if (scoped.length === 0) {
				throw new SnapshotDeferTargetObjectStoreTooFewTargetsError();
			}

			return scoped;
		}),
	) {
		this.targets = targets.map((target) => ({
			s3: new S3({
				credentials: {
					accessKeyId: target.accessKeyId,
					secretAccessKey: target.secretAccessKey,
				},
				endpoint: target.endpoint,
				region: target.region,
			}),
			bucket: target.bucket,
		}));

		logger.debug(`<${this.targets.length}> target(s)`);
	}

	private async _archive(source: string, destination: string): Promise<void> {
		await this.targets[0].s3.copyObject({
			Bucket: this.targets[0].bucket,
			CopySource: `${this.targets[0].bucket}/${source}`,
			Key: destination,
			MetadataDirective: "COPY",
		});

		await this.targets[0].s3.deleteObject({
			Bucket: this.targets[0].bucket,
			Key: source,
		});
	}

	async put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void> {
		const { id, sub } = Voucher.peek(voucher);

		const createdAt = new Date().toISOString();

		const keyBuffer = `${deferredBufferPrefix}/${id}`;
		const upload = new Upload({
			client: this.targets[0].s3,
			params: {
				Bucket: this.targets[0].bucket,
				Key: keyBuffer,
				Body: snapshot.pipe(new NdJsonEncodeTransform()),
				ContentType: "application/jsonlines",
			},
		});

		// prevent handle starvation from overly slow requests
		const raced = await Promise.race([upload.done(), setTimeout(10_000)]);
		if (typeof raced === "undefined") {
			await upload.abort();
			await this.targets[0].s3.deleteObject({
				Bucket: this.targets[0].bucket,
				Key: keyBuffer,
			});

			snapshot.destroy();

			logger.error(`<${id}> by <${sub}> was too slow, aborted`, {
				id,
				sub,
			});

			return;
		}

		// while partial hash can be obtained at any time, full hash only becomes known _after_ stream has been consumed
		const hash = snapshot.hash();

		// as s3 does not support in-place metadata updates, or any other mechanism of setting
		// metadata _after_ upload, a (server-side) copy is required
		const request = {
			Key: `${deferredPrefix}/${id}`,
			ContentType: "application/jsonlines",
			Metadata: {
				voucher: this.snapshot.voucher.serialize(voucher),
				version: hassVersion,
				hash: Snapshot.hash.serialize(hash),
				"created-at": createdAt,
			},
		} as const;

		// primary target
		await this.targets[0].s3.copyObject({
			Bucket: this.targets[0].bucket,
			CopySource: `${this.targets[0].bucket}/${keyBuffer}`,
			MetadataDirective: MetadataDirective.REPLACE,
			...request,
		});

		// mirror to non-primary targets
		{
			const mirrors = this.targets.slice(1);
			const mirroring = mirrors.map(async (target) => {
				// server-side copy does not work across different s3 providers → stream from primary
				const source = await this.targets[0].s3.getObject({
					Bucket: this.targets[0].bucket,
					Key: keyBuffer,
				});

				const stream = source.Body?.transformToWebStream();
				if (typeof stream === "undefined") {
					return;
				}

				const upload = new Upload({
					client: target.s3,
					params: {
						Bucket: target.bucket,
						Body: stream,
						...request,
					},
				});

				await upload.done();
			});

			for (const [idx, mirrored] of (
				await Promise.allSettled(mirroring)
			).entries()) {
				const target = mirrors[idx];
				if (mirrored.status === "rejected") {
					logger.error(`mirroring failure`, {
						endpoint: target.s3.config.endpoint,
						region: target.s3.config.region,
						bucket: target.bucket,
					});
					console.error(mirrored.reason);
				}
			}
		}

		// delete buffered
		await this.targets[0].s3.deleteObject({
			Bucket: this.targets[0].bucket,
			Key: keyBuffer,
		});
	}

	async deferred(): Promise<Maybe<SnapshotDeferTargetDeferred>> {
		const paginator = paginateListObjectsV2(
			{
				client: this.targets[0].s3,
				pageSize: 8,
			},
			{ Bucket: this.targets[0].bucket, Prefix: `${deferredPrefix}/` },
		);

		let picked;

		let pageCount = 0;
		const malformed: string[] = [];
		outer: for await (const page of paginator) {
			if (typeof page.Contents === "undefined") {
				break;
			}

			for (const descriptor of page.Contents) {
				if (typeof descriptor.Key === "undefined") {
					continue;
				}

				let object;
				try {
					// the body is left untouched until a consumer commits to it
					object = await this.targets[0].s3.headObject({
						Bucket: this.targets[0].bucket,
						Key: descriptor.Key,
					});
				} catch (e) {
					// should not happen when there is only one consumer, but happened regardless (during load testing with seaweedfs)
					if (e instanceof NotFound || e instanceof NoSuchKey) {
						continue;
					}

					throw e;
				}

				inner: {
					const voucherSerialized = object.Metadata?.voucher;
					if (typeof voucherSerialized === "undefined") {
						break inner;
					}

					const hassVersion = object?.Metadata?.version;
					if (typeof hassVersion === "undefined") {
						break inner;
					}

					const hashSerialized = object.Metadata?.hash;
					if (typeof hashSerialized === "undefined") {
						break inner;
					}

					let createdAt: Date | undefined;
					{
						const serialized = object?.Metadata?.["created-at"];
						if (typeof serialized !== "undefined") {
							const timestamp = Date.parse(serialized);
							if (!Number.isNaN(timestamp)) {
								createdAt = new Date(timestamp);
							} else {
								logger.error(
									`encountered invalid creation date <${serialized}>`,
									{ serialized, key: descriptor.Key },
								);
							}
						}

						if (typeof createdAt === "undefined") {
							logger.error("defaulting to current time", {
								key: descriptor.Key,
							});
							createdAt = new Date();
						}
					}

					const voucherDeserialized =
						this.snapshot.voucher.deserialize(voucherSerialized);
					switch (voucherDeserialized.kind) {
						case "success":
							break;
						case "error":
							break inner;
					}

					const hashDeserialized = Snapshot.hash.deserialize(hashSerialized);
					if (isNone(hashDeserialized)) {
						logger.error("encountered hash that could not be deserialized", {
							serialized: hashSerialized,
						});
						break inner;
					}

					picked = {
						key: descriptor.Key,
						voucher: voucherDeserialized.voucher,
						hassVersion,
						hash: hashDeserialized,
						createdAt,
					} as const;

					break outer;
				}

				malformed.push(descriptor.Key);
			}

			pageCount += 1;
			if (pageCount >= deferredMaxPages) {
				logger.error("exceeded page limit when listing objects");
				break;
			}
		}

		if (malformed.length > 0) {
			logger.error("encountered objects with malformed metadata", {
				malformed,
			});
			await Promise.allSettled(
				malformed.map((key) =>
					this._archive(
						key,
						key.replace(`${deferredPrefix}/`, `${archivePrefix}/`),
					),
				),
			);
		}

		if (typeof picked === "undefined") {
			return null;
		}

		const key = picked.key;

		return {
			voucher: picked.voucher,
			hash: picked.hash,
			hassVersion: picked.hassVersion,
			createdAt: picked.createdAt,
			open: () => this.open(key),
		};
	}

	private async open(
		key: string,
	): Promise<SnapshotDeferTargetDeferredSnapshot> {
		// the sdk layers wrappers of its own on top of the response (`ChecksumStream` when the object carries `x-amz-checksum-*`)
		// those link to their source with `pipe`, which does not propagate `destroy` backwards
		// aborting the request is the only teardown that reliably reaches the socket
		const abort = new AbortController();

		const object = await this.targets[0].s3.getObject(
			{ Bucket: this.targets[0].bucket, Key: key },
			{ abortSignal: abort.signal },
		);

		if (typeof object.Body === "undefined") {
			throw new SnapshotDeferTargetObjectStoreMissingBodyError(key);
		}

		bridgeFailure(object.Body);

		// a consumer can deliberately walk away mid-stream, which should not cause a warning
		let disposing = false;

		const chained = pipeline(
			Readable.fromWeb(object.Body.transformToWebStream()),
			new LineSplitTransform(),
			new NdJsonDecodeTransform(),
			new SnapshotPersistedTransform(),
			(err) => {
				if (err !== null && typeof err !== "undefined" && !disposing) {
					logger.error("deferred snapshot stream terminated early", {
						key,
						message: err.message,
					});
				}
			},
		);

		// `Readable` already carries an async disposer, but it only destroys, which leaves the request hanging
		return Object.assign(chained, {
			[Symbol.asyncDispose]: async () => {
				// an in flight failure has already run the pipeline callback by now, so this only ever mutes the teardown that follows
				disposing = true;

				// aborting alone releases the socket, but leaves the pipeline running forever
				// destroying alone tears down the pipeline, but leaves the socket checked out
				abort.abort();

				if (chained.destroyed) {
					return;
				}

				// teardown of pipeline
				const closed = new Promise<void>((resolve) => {
					chained.once("close", resolve);
				});

				// an in flight failure is already reported by the pipeline callback, it must not resurface here
				chained.once("error", () => {});
				chained.destroy();

				// resolves once teardown has propagated back
				await closed;
			},
		});
	}

	async complete(id: Uuid): Promise<void> {
		await this.targets[0].s3.deleteObject({
			Bucket: this.targets[0].bucket,
			Key: `${deferredPrefix}/${id}`,
		});
	}

	archive(id: Uuid): Promise<void> {
		return this._archive(`${deferredPrefix}/${id}`, `${archivePrefix}/${id}`);
	}

	async pending(): Promise<number> {
		let count = 0;

		const paginator = paginateListObjectsV2(
			{
				client: this.targets[0].s3,
				pageSize: 64,
			},
			{ Bucket: this.targets[0].bucket, Prefix: `${deferredPrefix}/` },
		);
		for await (const page of paginator) {
			count += page.KeyCount ?? 0;
		}

		return count;
	}

	async archived(): Promise<number> {
		let count = 0;

		const paginator = paginateListObjectsV2(
			{
				client: this.targets[0].s3,
				// https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html#AmazonS3-ListObjectsV2-request-uri-querystring-MaxKeys
				pageSize: 1_000,
			},
			{ Bucket: this.targets[0].bucket, Prefix: `${archivePrefix}/` },
		);
		for await (const page of paginator) {
			count += page.KeyCount ?? 0;
		}

		return count;
	}
}
