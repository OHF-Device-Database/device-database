import { createContext } from "@lit/context";

export type SsrLocation = {
	origin: string;
	pathname: string;
	status: (code: number) => void;
};

export const ContextSsrLocation = createContext<SsrLocation>(
	Symbol("location")
);
