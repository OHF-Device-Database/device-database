import { container } from "./dependency";
import { logger } from "./logger";
import { IDatabaseDerived, IDatabaseStaging } from "./service/database";
import { IDeriveDerived } from "./service/derive";
import { IDeriveDerivableDevice } from "./service/derive/derivable/device";
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
	derive: {
		derived: IDeriveDerived,
	},
	derivable: {
		device: IDeriveDerivableDevice,
	},
	voucher: IVoucher,
	snapshot: ISnapshot,
	snapshotDeferTarget: ISnapshotDeferTarget,
};
// biome-ignore-end lint/suspicious/noExplicitAny: ↑
