import { createInterface } from "node:readline/promises";
import type { TransformCallback } from "node:stream";
import { pipeline, Readable, Transform } from "node:stream";

import { inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";
import S3mini from "s3mini";

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
	}) {
		const labels = {
			accessKeyId: "AccessKeyId",
			secretAccessKey: "SecretAccessKey",
			endpoint: "Endpoint",
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
	private s3: S3mini;

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
				});
			}

			return {
				accessKeyId: scoped.accessKeyId,
				secretAccessKey: scoped.secretAccessKey,
				endpoint: scoped.endpoint,
				bucket: scoped.bucket,
				region: scoped.region ?? undefined,
			};
		}),
	) {
		this.s3 = new S3mini({
			accessKeyId: configuration.accessKeyId,
			secretAccessKey: configuration.secretAccessKey,
			endpoint: configuration.endpoint,
			...(typeof configuration.region !== "undefined"
				? { region: configuration.region }
				: {}),
			minPartSize: 512 * 1024,
		});
	}

	async put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void> {
		const { id } = Voucher.peek(voucher);

		const readable = ReadableStream.from(
			snapshot.pipe(new NdJsonEncodeTransform()),
		);

		await this.s3.putAnyObject(
			`${prefix}/${id}`,
			readable,
			"application/jsonlines",
			undefined,
			// https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
			{
				"x-amz-meta-voucher": this.snapshot.voucher.serialize(voucher),
				"x-amz-meta-hass-version": hassVersion,
			},
		);
	}

	async deferred(): Promise<Maybe<SnapshotDeferTargetDeferred>> {
		let picked;

		let token: string | undefined;
		let page = 0;
		const malformed: string[] = [];
		do {
			const response = await this.s3.listObjectsPaged("/", prefix, 8, token);

			if (
				typeof response === "undefined" ||
				response === null ||
				response.objects === null
			) {
				return null;
			}

			// pick first object with a valid descriptor
			outer: for (const descriptor of response.objects) {
				const object = await this.s3.getObjectResponse(descriptor.Key);
				if (isNone(object) || isNone(object.body)) {
					continue;
				}

				inner: {
					const voucherSerialized = object.headers.get("x-amz-meta-voucher");
					if (isNone(voucherSerialized)) {
						break inner;
					}

					const hassVersion = object.headers.get("x-amz-meta-hass-version");
					if (isNone(hassVersion)) {
						break inner;
					}

					const voucherDeserialized =
						this.snapshot.voucher.deserialize(voucherSerialized);
					switch (voucherDeserialized.kind) {
						case "success":
							picked = [
								voucherDeserialized.voucher,
								hassVersion,
								object.body,
							] as const;

							break outer;
						case "error":
							break inner;
					}
				}

				malformed.push(descriptor.Key);
			}

			token = response.nextContinuationToken;
			page += 1;
		} while (token && page < deferredMaxPages);

		if (malformed.length > 0) {
			logger.warn("encountered objects with malformed metadata", { malformed });
		}

		if (typeof picked === "undefined" && page === deferredMaxPages - 1) {
			logger.warn("exceeded page limit when listing objects");
		}

		if (typeof picked === "undefined") {
			return null;
		}

		const rl = createInterface({
			input: Readable.fromWeb(picked[2]),
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
		await this.s3.deleteObject(`${prefix}/${id}`);
	}

	async pending(): Promise<number> {
		let count = 0;

		let token: string | undefined;
		do {
			const response = await this.s3.listObjectsPaged("/", prefix, 64, token);

			if (typeof response === "undefined" || response === null) {
				break;
			}

			count += response.objects !== null ? response.objects.length : 0;
			token = response.nextContinuationToken;
		} while (token);

		return count;
	}
}
