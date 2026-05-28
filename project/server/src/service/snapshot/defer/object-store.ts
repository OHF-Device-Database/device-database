import { createInterface } from "node:readline/promises";
import type { TransformCallback } from "node:stream";
import { pipeline, Readable, Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";

import {
	MetadataDirective,
	NoSuchKey,
	paginateListObjectsV2,
	S3,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { ConfigProvider } from "../../../config";
import { logger as parentLogger } from "../../../logger";
import { isNone, type Maybe } from "../../../type/maybe";
import { Voucher } from "../../voucher";
import { ISnapshot, Snapshot, type SnapshotVoucher } from "..";
import {
	type SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

import type { Uuid } from "../../../type/codec/uuid";
import type { ISnapshotDeferTarget, SnapshotDeferTargetDeferred } from "./base";

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

		logger.debug(`<${this.targets.length}> targets`);
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

			logger.warn(`<${id}> by <${sub}> took was too slow, aborted`, {
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
					logger.warn(`mirroring failure`, {
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
					object = await this.targets[0].s3.getObject({
						Bucket: this.targets[0].bucket,
						Key: descriptor.Key,
					});
				} catch (e) {
					// should not happen when there is only one consumer, but happened regardless (during load testing with seaweedfs)
					if (e instanceof NoSuchKey) {
						continue;
					}

					throw e;
				}

				if (typeof object.Body === "undefined") {
					continue;
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
								logger.warn(
									`encountered invalid creation date <${serialized}>`,
									{ serialized, key: descriptor.Key },
								);
							}
						}

						if (typeof createdAt === "undefined") {
							logger.warn("defaulting to current time", {
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
						logger.warn("encountered hash that could not be deserialized", {
							serialized: hashSerialized,
						});
						break inner;
					}

					picked = {
						voucher: voucherDeserialized.voucher,
						hassVersion,
						hash: hashDeserialized,
						createdAt,
						body: object.Body,
					} as const;

					break outer;
				}

				malformed.push(descriptor.Key);
			}

			pageCount += 1;
			if (pageCount >= deferredMaxPages) {
				logger.warn("exceeded page limit when listing objects");
				break;
			}
		}

		if (malformed.length > 0) {
			logger.warn("encountered objects with malformed metadata", { malformed });
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

		const rl = createInterface({
			input: Readable.fromWeb(picked.body.transformToWebStream()),
			crlfDelay: Infinity,
		});

		const chained = pipeline(
			Readable.from(rl),
			new NdJsonDecodeTransform(),
			new SnapshotPersistedTransform(),
			() => {},
		);

		return {
			voucher: picked.voucher,
			hash: picked.hash,
			hassVersion: picked.hassVersion,
			createdAt: picked.createdAt,
			snapshot: chained,
		};
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
