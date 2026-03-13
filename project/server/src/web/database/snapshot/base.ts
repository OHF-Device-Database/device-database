import { Schema } from "effect";

import { DatabaseSnapshotCoordinatorName } from "../../../service/database/snapshot-coordinator/base";

export const Query = Schema.Struct({
	voucher: Schema.String,
});

export const DatabaseSnapshotVoucherPayload = Schema.Struct({
	coordinator: DatabaseSnapshotCoordinatorName,
});
export type DatabaseSnapshotVoucherPayload =
	typeof DatabaseSnapshotVoucherPayload.Type;
