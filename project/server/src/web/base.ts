import type { Schema } from "effect";

import { Query as QueryDatabaseSnapshot } from "./database/current/base";

export const paths = {
	"database-snapshot-current": "/system/database/snapshot-current.db",
	"database-snapshot-cached": "/system/database/snapshot.db",
} as const;
export const Paths = typeof paths;

type ParameterValue = {
	query?: Schema.Any;
	path?: Schema.Any;
	header?: Schema.Any;
};
type DereferenceParameters<T extends Record<string, ParameterValue>> = {
	[K0 in keyof T]: {
		[K1 in keyof T[K0]]: "Type" extends keyof T[K0][K1]
			? T[K0][K1]["Type"]
			: never;
	};
};

export const parameters = {
	"database-snapshot-current": { query: QueryDatabaseSnapshot },
} as const;
export type Parameters = DereferenceParameters<typeof parameters>;
