import { createType } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { floor } from "../type/codec/integer";
import { env, optional, required } from "./utility";

export enum SnapshotDeferTarget {
	None = "none",
	ObjectStore = "object-store",
}

/* node:coverage disable */
export const config = () =>
	({
		host: env.string(required("HOST", "127.0.0.1")),
		port: env.integer(required("PORT", floor(3000))),
		logLevel: env.string(required("LOG_LEVEL", "debug")),
		secure: env.boolean(required("SECURE", true)),
		/** initially running side-by-side with with other instance */
		initiallyConcurrent: env.boolean(required("INITIALLY_CONCURRENT", false)),
		external: {
			// e.g. "example.com"
			authority: env.string(required("EXTERNAL_AUTHORITY")),
			// https / http
			secure: env.boolean(required("EXTERNAL_SECURE", true)),
		},
		signing: {
			voucher: env.string(required("SIGNING_VOUCHER")),
		},
		database: {
			// string instead of path because ":memory:" and other SQLite arcana should be supported
			path: {
				derived: env.string(required("DATABASE_PATH_DERIVED", "./derived.db")),
				staging: env.string(required("DATABASE_PATH_STAGING", "./staging.db")),
			},
			/** should migrations be applied, or should the schema   */
			migrate: env.boolean(required("DATABASE_MIGRATE", true)),
			snapshot: {
				destination: {
					staging: env.string(
						optional("DATABASE_SNAPSHOT_DESTINATION_STAGING"),
					),
				},
			},
		},
		snapshot: {
			voucher: {
				/** when the next voucher is expected at the earliest in relation to the creation time of the previous voucher — in seconds */
				expectedAfter: env.integer(
					required("SNAPSHOT_VOUCHER_EXPECTED_AFTER", floor(60 * 60 * 23)),
				),
				/** how long a voucher is valid for — in seconds */
				ttl: env.integer(required("SNAPSHOT_VOUCHER_TTL", floor(60 * 60 * 2))),
			},
			defer: {
				target: env.choice(Schema.Enums(SnapshotDeferTarget))(
					required("SNAPSHOT_DEFER_TARGET", SnapshotDeferTarget.None),
				),
				/** allows processing of deferred snapshot to be paused while still taking in new snapshots */
				process: env.boolean(required("SNAPSHOT_DEFER_PROCESS", true)),
				objectStore: env.many((env) =>
					env.unite("SNAPSHOT_DEFER_OBJECT_STORE", (env) => ({
						accessKeyId: env.string(required("ACCESS_KEY_ID")),
						secretAccessKey: env.string(required("SECRET_ACCESS_KEY")),
						endpoint: env.string(required("ENDPOINT")),
						region: env.string(required("REGION", "auto")),
						bucket: env.string(required("BUCKET")),
					})),
				),
			},
		},
		vendor: {
			slack: {
				botToken: env.string(optional("VENDOR_SLACK_BOT_TOKEN")),
				callback: {
					signingKey: env.string(optional("VENDOR_SLACK_CALLBACK_SIGNING_KEY")),
				},
			},
		},
		introspection: {
			bearerToken: env.string(optional("INTROSPECTION_BEARER_TOKEN")),
		},
		derive: {
			enable: env.boolean(required("DERIVE_ENABLE", true)),
		},
	}) as const;

type Config = ReturnType<typeof config>;

type ConfigProvider = <T>(fn: (config: Config) => T) => T;

export const ConfigProvider = createType<ConfigProvider>("ConfigProvider");
export const configProvider =
	<C extends () => unknown>(
		config: C,
	): (<T>(fn: (config: ReturnType<C>) => T) => T) =>
	<T>(fn: (config: ReturnType<C>) => T) =>
		fn(config() as ReturnType<C>);
/* node:coverage enable */
