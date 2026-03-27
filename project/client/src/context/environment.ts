import { createContext } from "@lit/context";

export type Environment = {
	title: (title?: string) => void;
	meta: (tags?: Record<string, string>) => void;
	headers?: ((headers: Record<string, string[]>) => void) | undefined;
	status?: ((code: number) => void) | undefined;
};

export const ContextEnvironment = createContext<Environment>(
	Symbol("environment")
);
