import { Schema } from "effect/index";

import { floor } from "./integer";
import { UnixTime } from "./unix-time";

/* node:coverage disable */
export const DateFromUnixTime = Schema.transform(
	UnixTime,
	// invalid dates can return `NaN` for `.getTime()` → constrain so that encoding always succeeds
	Schema.ValidDateFromSelf,
	{
		strict: true,
		decode: (value) => new Date(value * 1000),
		encode: (value) => floor(value.getTime() / 1000) as UnixTime,
	},
);
/* node:coverage enable */
