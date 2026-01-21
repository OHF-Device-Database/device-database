import { createInterface } from "node:readline/promises";
import type { TransformCallback } from "node:stream";
import { pipeline, Readable, Transform } from "node:stream";

import { paginateListObjectsV2, S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { ConfigProvider } from "../../../config";
import { logger as parentLogger } from "../../../logger";
import { isNone, type Maybe } from "../../../type/maybe";
import { Voucher } from "../../voucher";
import { ISnapshot, type SnapshotVoucher } from "..";
import {
	type SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

import type { Uuid } from "../../../type/codec/uuid";
import type { ISnapshotDeferTarget, SnapshotDeferTargetDeferred } from "./base";

const logger = parentLogger.child({
	label: "snapshot-defer-target-object-store",
});

class SnapshotDeferTargetObjectStoreConfigurationIncompleteError extends Error {
	constructor(missing: {
		accessKeyId: boolean;
		secretAccessKey: boolean;
		endpoint: boolean;
		bucket: boolean;
	}) {
		const labels = {
			accessKeyId: "AccessKeyId",
			secretAccessKey: "SecretAccessKey",
			endpoint: "Endpoint",
			bucket: "Bucket",
		} satisfies Record<keyof typeof missing, string>;

		super(
			`incomplete configuration: ${Object.entries(missing)
				.filter(([_, value]) => value)
				.map(([key, _]) => labels[key as keyof typeof missing])
				.join(", ")}`,
		);

		Object.setPrototypeOf(
			this,
			SnapshotDeferTargetObjectStoreConfigurationIncompleteError.prototype,
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

const prefix = "submission";
const deferredMaxPages = 4;

export class SnapshotDeferTargetObjectStore implements ISnapshotDeferTarget {
	private s3: S3;
	private bucket: string;

	constructor(
		private snapshot = inject(ISnapshot),
		configuration = inject(ConfigProvider)((c) => {
			const scoped = c.snapshot.defer.objectStore;

			if (
				isNone(scoped.accessKeyId) ||
				isNone(scoped.secretAccessKey) ||
				isNone(scoped.endpoint) ||
				isNone(scoped.bucket)
			) {
				throw new SnapshotDeferTargetObjectStoreConfigurationIncompleteError({
					accessKeyId: isNone(scoped.accessKeyId),
					secretAccessKey: isNone(scoped.secretAccessKey),
					endpoint: isNone(scoped.endpoint),
					bucket: isNone(scoped.bucket),
				});
			}

			return {
				accessKeyId: scoped.accessKeyId,
				secretAccessKey: scoped.secretAccessKey,
				endpoint: scoped.endpoint,
				region: scoped.region ?? undefined,
				bucket: scoped.bucket,
			};
		}),
	) {
		this.s3 = new S3({
			credentials: {
				accessKeyId: configuration.accessKeyId,
				secretAccessKey: configuration.secretAccessKey,
			},
			endpoint: configuration.endpoint,
			region: configuration.region ?? "auto",
		});
		this.bucket = configuration.bucket;
	}

	async put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void> {
		const { id } = Voucher.peek(voucher);

		const upload = new Upload({
			client: this.s3,
			params: {
				Bucket: this.bucket,
				Key: `${prefix}/${id}`,
				Body: snapshot.pipe(new NdJsonEncodeTransform()),
				ContentType: "application/jsonlines",
				Metadata: {
					voucher: this.snapshot.voucher.serialize(voucher),
					version: hassVersion,
				},
			},
		});

		await upload.done();
	}

	async deferred(): Promise<Maybe<SnapshotDeferTargetDeferred>> {
		const paginator = paginateListObjectsV2(
			{
				client: this.s3,
				pageSize: 8,
			},
			{ Bucket: this.bucket, Prefix: prefix },
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

				const object = await this.s3.getObject({
					Bucket: this.bucket,
					Key: descriptor.Key,
				});

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

					const voucherDeserialized =
						this.snapshot.voucher.deserialize(voucherSerialized);
					switch (voucherDeserialized.kind) {
						case "success":
							break;
						case "error":
							break inner;
					}

					picked = [
						voucherDeserialized.voucher,
						hassVersion,
						object.Body,
					] as const;

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
		}

		if (typeof picked === "undefined") {
			return null;
		}

		const rl = createInterface({
			input: Readable.fromWeb(picked[2].transformToWebStream()),
			crlfDelay: Infinity,
		});

		const chained = pipeline(
			Readable.from(rl),
			new NdJsonDecodeTransform(),
			new SnapshotPersistedTransform(),
			() => {},
		);

		return {
			voucher: picked[0],
			hassVersion: picked[1],
			snapshot: chained,
		};
	}

	async complete(id: Uuid): Promise<void> {
		await this.s3.deleteObject({ Bucket: this.bucket, Key: `${prefix}/${id}` });
	}

	async pending(): Promise<number> {
		let count = 0;

		const paginator = paginateListObjectsV2(
			{
				client: this.s3,
				pageSize: 64,
			},
			{ Bucket: this.bucket, Prefix: prefix, Delimiter: "/" },
		);
		for await (const page of paginator) {
			count += page.Contents?.length ?? 0;
		}

		return count;
	}
}
