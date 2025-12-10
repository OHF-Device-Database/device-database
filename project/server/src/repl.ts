import { container } from "./dependency";
import { logger } from "./logger";
import { IVoucher } from "./service/voucher";
import { unroll } from "./utility/iterable";

logger.level = "debug";

// biome-ignore-start lint/suspicious/noExplicitAny: repl globals
(global as any).container = container;
(global as any).unroll = unroll;

(global as any).tokens = { voucher: IVoucher };
// biome-ignore-end lint/suspicious/noExplicitAny: ↑
