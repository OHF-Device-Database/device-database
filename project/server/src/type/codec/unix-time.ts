import { Schema } from "effect";

import { floor, Integer } from "./integer";

export const UnixTime = Integer.pipe(
	Schema.nonNegative(),
	Schema.brand("UnixTime"),
);
export type UnixTime = typeof UnixTime.Type;

export const now = (): UnixTime => floor(Date.now() / 1000) as UnixTime;
