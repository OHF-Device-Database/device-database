import { Schema } from "effect";

export const Query = Schema.Struct({
	voucher: Schema.String,
});
