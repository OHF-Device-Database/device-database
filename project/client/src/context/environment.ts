import { createContext } from "@lit/context";

export type Environment = {
	title: (title?: string) => void;
	meta: (tags?: Record<string, string>) => void;
	status?: ((code: number) => void) | undefined;
};

export const ContextEnvironment = createContext<Environment>(
	Symbol("environment")
);
