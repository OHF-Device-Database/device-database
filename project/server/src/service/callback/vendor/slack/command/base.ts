import type { Block } from "../block";

export type Handled = {
	response_type: "in_channel" | "ephemeral";
	blocks: Block[];
};

export type HandleContext = {
	responseUrl: string;
	userId: string;
};

export type ParsedCommandTextParsed<T> = {
	kind: "parsed";
	inner: T;
};
export type ParsedCommandTextError = {
	kind: "error";
	blocks: Block[];
};

export const words = (text: string): string[] =>
	text.trim().split(/\s+/).filter(Boolean);

// biome-ignore lint/suspicious/noExplicitAny: mixin constructors are variadic
export type Constructor<T> = new (...args: any[]) => T;

/** tags the suspensions this vendor holds */
export const CallbackVendorSlackSymbol = Symbol("CallbackVendorSlack");

export const ephemeral = (...blocks: Block[]): Handled => ({
	response_type: "ephemeral",
	blocks,
});

export const described = (id: symbol): string =>
	typeof id.description !== "undefined" ? `\`${id.description}\`` : "?";

export const reason = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
