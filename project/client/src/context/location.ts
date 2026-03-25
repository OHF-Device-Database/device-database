import { createContext } from "@lit/context";

export type Location = {
	pathname: string;
	searchParams: URLSearchParams;
};

export const ContextLocation = createContext<Location>(Symbol("location"));
