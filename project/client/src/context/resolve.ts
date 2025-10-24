import { createContext } from "@lit/context";

export type ResolveResolved = [readonly unknown[], unknown];
export type Resolve = (
	locationToken: LocationToken,
	task: () => Promise<ResolveResolved>
) => void;

export const ContextResolve = createContext<Resolve>(Symbol("resolve"));
