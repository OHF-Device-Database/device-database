import { createType } from "@lppedd/di-wise-neo";

import type { Uuid } from "../../../type/codec/uuid";
import type { Maybe } from "../../../type/maybe";
import type { SnapshotHash, SnapshotVoucher } from "..";
import type {
	SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

/** holds handle, dispose to prevent handle leakage when not consuming */
export type SnapshotDeferTargetDeferred = {
	voucher: SnapshotVoucher;
	hassVersion: string;
	hash: SnapshotHash;
	snapshot: AsyncIterable<SnapshotRequestTransformOut>;
	createdAt: Date;
	/** releases the handle backing `snapshot` */
	[Symbol.asyncDispose]: () => Promise<void>;
};

export type ISnapshotDeferTarget = {
	put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void>;
	/** the result must be disposed, see {@link SnapshotDeferTargetDeferred} */
	deferred(): Promise<Maybe<SnapshotDeferTargetDeferred>>;
	/** should be called after successful ingestion */
	complete(id: Uuid): Promise<void>;
	/** should be called after ingestion error */
	archive(id: Uuid): Promise<void>;
	pending(): Promise<number>;
	archived(): Promise<number>;
};

export const ISnapshotDeferTarget = createType<ISnapshotDeferTarget>(
	"ISnapshotDeferTarget",
);
