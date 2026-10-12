import { createType } from "@lppedd/di-wise-neo";

import type { Uuid } from "../../../type/codec/uuid";
import type { Maybe } from "../../../type/maybe";
import type { SnapshotHash, SnapshotVoucher } from "..";
import type {
	SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

/** body of a deferred snapshot
 *
 * must be disposed, whether iterated or not, to release the handle backing it */
export type SnapshotDeferTargetDeferredSnapshot =
	AsyncIterable<SnapshotRequestTransformOut> & AsyncDisposable;

/** metadata of a deferred snapshot, obtainable without touching its body */
export type SnapshotDeferTargetDeferred = {
	voucher: SnapshotVoucher;
	hassVersion: string;
	hash: SnapshotHash;
	createdAt: Date;
	/** the result must be disposed, see {@link SnapshotDeferTargetDeferredSnapshot} */
	open(): Promise<SnapshotDeferTargetDeferredSnapshot>;
};

export type ISnapshotDeferTarget = {
	put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void>;
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
