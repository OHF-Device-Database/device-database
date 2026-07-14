import { stringify } from "safe-stable-stringify";
import * as winston from "winston";
import { createLogger, format, transports } from "winston";

import { MiddlewareRequestStorageDomain } from "./api/middleware/request-storage";
import { requestStorage } from "./utility/request-storage";

// logger configuration needs no test coverage
/* node:coverage disable */
const logLevels = {
	levels: {
		error: 1,
		warn: 2,
		info: 3,
		debug: 4,
		verbose: 5,
	},
	colors: {
		error: "red",
		warn: "yellow",
		info: "magenta",
		debug: "blue",
		verbose: "gray",
	},
};
winston.addColors(logLevels.colors);

// Output format, chosen by env. With no env set the behaviour is unchanged
// from before: colourised, human-readable lines.
//   LOG_FORMAT=json    one JSON object per line — structured, for log
//                      aggregation (VictoriaLogs). No ANSI colour.
//   LOG_FORMAT=pretty  colourised human-readable line (the default).
// NO_COLOR (https://no-color.org) disables colour in pretty mode.
const logFormat = process.env.LOG_FORMAT ?? "pretty";
const useColor = logFormat === "pretty" && !process.env.NO_COLOR;

// Fill in the request identifier from request storage when it wasn't set
// explicitly (e.g. by the `request-log` middleware). Applied before the
// transports so both the json and pretty formats pick it up.
const requestId = format((info) => {
	info.request =
		info.request ??
		requestStorage
			.getStore()
			?.scope<string>(MiddlewareRequestStorageDomain)
			?.get();
	return info;
});

const pretty = format.combine(
	...(useColor ? [format.colorize()] : []),
	format.printf(({ level, message, label, ...rest }) => {
		// biome-ignore lint/style/useTemplate: slightly faster
		const prefix = label ? label + "/" : "";
		// `stringify` (safe-stable-stringify) instead of `JSON.stringify`,
		// which can't deal with `BigInt`.
		return `${prefix}${level}: ${message} ${stringify(rest)}`;
	}),
);

// `stringify` (not winston's `format.json()`) so `BigInt` and circular refs
// don't throw, with deterministic key order.
const jsonLine = format.printf((info) => stringify(info));

export const logger = createLogger({
	levels: logLevels.levels,
	defaultMeta: {},
	format: format.combine(
		format.timestamp(),
		format.errors({ stack: true }),
		requestId(),
	),
	transports: [
		new transports.Console({
			format: logFormat === "json" ? jsonLine : pretty,
		}),
	],
});
/* node:coverage enable */
