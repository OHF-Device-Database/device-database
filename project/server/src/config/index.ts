import { createType } from "@lppedd/di-wise-neo";
import { Schema } from "effect/index";

import { floor } from "../type/codec/integer";
import {
	envBoolean,
	envChoice,
	envInteger,
	envString,
	optional,
	required,
} from "./utility";

export enum SnapshotDeferTarget {
	None = "none",
	ObjectStore = "object-store",
}

/* node:coverage disable */
export const config = () =>
	({
		host: envString(required("HOST", "127.0.0.1")),
		port: envInteger(required("PORT", floor(3000))),
		logLevel: envString(required("LOG_LEVEL", "debug")),
		secure: envBoolean(required("SECURE", true)),
		external: {
			// e.g. "example.com"
			authority: envString(required("EXTERNAL_AUTHORITY")),
			// https / http
			secure: envBoolean(required("EXTERNAL_SECURE", true)),
		},
		signing: {
			voucher: envString(required("SIGNING_VOUCHER")),
		},
		database: {
			// string instead of path because ":memory:" and other SQLite arcana should be supported
			path: envString(required("DATABASE_PATH", "./server.db")),
			/** should migrations be applied, or should the schema   */
			migrate: envBoolean(required("DATABASE_MIGRATE", true)),
			/** indicates that an external process (e.g. litestream) enforces checkpoint rules */
			externalCheckpoint: envBoolean(
				required("DATABASE_EXTERNAL_CHECKPOINT", true),
			),
		},
		snapshot: {
			voucher: {
				/** when the next voucher is expected at the earliest in relation to the creation time of the previous voucher — in seconds */
				expectedAfter: envInteger(
					required("SNAPSHOT_VOUCHER_EXPECTED_AFTER", floor(60 * 60 * 23)),
				),
				/** how long a voucher is valid for — in seconds */
				ttl: envInteger(required("SNAPSHOT_VOUCHER_TTL", floor(60 * 60 * 2))),
			},
			defer: {
				target: envChoice(Schema.Enums(SnapshotDeferTarget))(
					required("SNAPSHOT_DEFER_TARGET", SnapshotDeferTarget.None),
				),
				objectStore: {
					bucket: envString(optional("SNAPSHOT_DEFER_OBJECT_STORE_BUCKET")),
					accessKeyId: envString(
						optional("SNAPSHOT_DEFER_OBJECT_STORE_ACCESS_KEY_ID"),
					),
					secretAccessKey: envString(
						optional("SNAPSHOT_DEFER_OBJECT_STORE_SECRET_ACCESS_KEY"),
					),
					endpoint: envString(optional("SNAPSHOT_DEFER_OBJECT_STORE_ENDPOINT")),
					region: envString(optional("SNAPSHOT_DEFER_OBJECT_REGION")),
				},
			},
		},
		vendor: {
			slack: {
				webhook: {
					submission: envString(optional("VENDOR_SLACK_WEBHOOK_SUBMISSION")),
				},
				callback: {
					signingKey: envString(optional("VENDOR_SLACK_CALLBACK_SIGNING_KEY")),
				},
			},
		},
		introspection: {
			bearerToken: envString(optional("INTROSPECTION_BEARER_TOKEN")),
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
