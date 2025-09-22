import { Schema } from "effect/index";

import { floor } from "./integer";
import { UnixTime } from "./unix-time";

const guard = Schema.is(UnixTime);

/* c8 ignore start */
export const DateFromUnixTime = Schema.transform(
	UnixTime,
	// invalid dates can return `NaN` for `.getTime()` → constrain so that encoding always succeeds
	Schema.DateFromSelf.pipe(
		Schema.filter((date) => guard(date.getTime() / 1000)),
	),
	{
		strict: true,
		decode: (value: UnixTime) => new Date(value * 1000),
		encode: (value: Date) => floor(value.getTime() / 1000) as UnixTime,
	},
);
/* c8 ignore stop */
