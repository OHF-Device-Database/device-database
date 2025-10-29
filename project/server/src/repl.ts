import { container } from "./dependency";
import { logger } from "./logger";
import { unroll } from "./utility/iterable";

logger.level = "debug";

// biome-ignore-start lint/suspicious/noExplicitAny: repl globals
(global as any).container = container;
(global as any).unroll = unroll;

(global as any).tokens = {};
// biome-ignore-end lint/suspicious/noExplicitAny: ↑
