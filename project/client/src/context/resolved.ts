import { createContext } from "@lit/context";

import type { ResolveResolved } from "./resolve";

export type Resolved = Record<LocationToken, ResolveResolved>;

export const ContextResolved = createContext<Resolved>(Symbol("resolved"));
