import { createContext } from "@lit/context";

import type { SsrResolveResolved } from "./resolve";

export type SsrResolved = Record<LocationToken, SsrResolveResolved>;

export const ContextSsrResolved = createContext<SsrResolved>(
	Symbol("resolved")
);
