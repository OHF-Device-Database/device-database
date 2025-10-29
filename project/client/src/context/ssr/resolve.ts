import { createContext } from "@lit/context";

export type SsrResolveResolved = [readonly unknown[], unknown];
export type SsrResolve = (
	locationToken: LocationToken,
	task: () => Promise<SsrResolveResolved>
) => void;

export const ContextSsrResolve = createContext<SsrResolve>(Symbol("resolve"));
