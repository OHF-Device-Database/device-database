import { floor } from "../type/codec/integer";
import {
	envBoolean,
	envInteger,
	envString,
	optional,
	required,
} from "./utility";

export const config = {
	host: envString(required("HOST", "127.0.0.1")),
	port: envInteger(required("PORT", floor(3000))),
	logLevel: envString(required("LOG_LEVEL", "debug")),
	secure: envBoolean(required("SECURE", true)),
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
		},
	},
	introspection: {
		enable: envBoolean(required("INTROSPECTION_ENABLE", true)),
		port: envInteger(required("INTROSPECTION_PORT", floor(3100))),
	},
};
