import { createContext } from "@lit/context";
import type { Fetch } from "../api/base";

export const ContextFetch = createContext<Fetch>(Symbol("fetch"));
