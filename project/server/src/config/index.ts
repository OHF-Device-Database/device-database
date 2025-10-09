import { createType } from "@lppedd/di-wise-neo";

import { floor } from "../type/codec/integer";
import {
	envBoolean,
	envInteger,
	envString,
	optional,
	required,
} from "./utility";

/* c8 ignore start */
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
/* c8 ignore stop */
