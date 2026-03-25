import { createContext } from "@lit/context";
import type { Router } from "../vendor/@lit-labs/router/router";

export const ContextRouter = createContext<Router>(Symbol("router"));
