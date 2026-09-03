import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabaseDerived, IDatabaseStaging } from "./service/database";
import { IScheduler } from "./service/scheduler";
import { ISchedulerScheduledDeriveDevice } from "./service/scheduler/scheduled/derive/device";
import { ISnapshot } from "./service/snapshot";
import { ISnapshotDeferTarget } from "./service/snapshot/defer/base";
import { IVoucher } from "./service/voucher";
import { unroll } from "./utility/iterable";

logger.level = "debug";

// biome-ignore-start lint/suspicious/noExplicitAny: repl globals
(global as any).container = container;
(global as any).unroll = unroll;

(global as any).tokens = {
	database: {
		derived: IDatabaseDerived,
		staging: IDatabaseStaging,
	},
	scheduler: IScheduler,
	derivable: {
		device: ISchedulerScheduledDeriveDevice,
	},
	voucher: IVoucher,
	snapshot: ISnapshot,
	snapshotDeferTarget: ISnapshotDeferTarget,
};
// biome-ignore-end lint/suspicious/noExplicitAny: ↑
