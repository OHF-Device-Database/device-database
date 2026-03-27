import { createContext } from "@lit/context";

export type Location = {
	origin: string;
	pathname: string;
	searchParams: URLSearchParams;
};

export const ContextLocation = createContext<Location>(Symbol("location"));
