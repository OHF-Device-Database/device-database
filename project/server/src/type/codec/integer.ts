import { Schema } from "effect";

export const Integer = Schema.Number.pipe(Schema.int()).pipe(
	Schema.brand("Integer"),
);
export type Integer = typeof Integer.Type;

export const floor = (n: number): Integer => Math.floor(n) as Integer;
