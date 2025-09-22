import { randomUUID } from "node:crypto";

import { Schema } from "effect/index";

export const Uuid = Schema.UUID.pipe(Schema.brand("Uuid"));
export type Uuid = typeof Uuid.Type;

/* c8 ignore start */
export const uuid = (): Uuid => {
	return randomUUID() as Uuid;
};
/* c8 ignore stop */
