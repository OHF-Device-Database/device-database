import { createType } from "@lppedd/di-wise-neo";

import type { Uuid } from "../../../type/codec/uuid";
import type { Maybe } from "../../../type/maybe";
import type { SnapshotVoucher } from "..";
import type {
	SnapshotRequestTransform,
	SnapshotRequestTransformOut,
} from "../stream";

export type SnapshotDeferTargetDeferred = {
	voucher: SnapshotVoucher;
	hassVersion: string;
	snapshot: AsyncIterable<SnapshotRequestTransformOut>;
};

export type ISnapshotDeferTarget = {
	put(
		voucher: SnapshotVoucher,
		hassVersion: string,
		snapshot: SnapshotRequestTransform,
	): Promise<void>;
	deferred(): Promise<Maybe<SnapshotDeferTargetDeferred>>;
	complete(id: Uuid): Promise<void>;
	pending(): Promise<number>;
};

export const ISnapshotDeferTarget = createType<ISnapshotDeferTarget>(
	"ISnapshotDeferTarget",
);
