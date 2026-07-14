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

// https://no-color.org/ (https://web.archive.org/web/20260616201813/https://no-color.org/)
const noColor = "NO_COLOR" in process.env;

const requestId = () =>
	requestStorage
		.getStore()
		?.scope<string>(MiddlewareRequestStorageDomain)
		?.get();

const formatPretty = format.combine(
	...(noColor ? [] : [format.colorize()]),
	format.printf(({ level, message, label, ...rest }) => {
		// `JSON.stringify` can't deal with `BigInt`
		// https://github.com/winstonjs/logform/blob/fdc37d1592d9911d7c34f4bb1bca9eb70476995a/simple.js#L18
		const stringifiedRest = stringify({
			...rest,
			request: rest.request ?? requestId(),
		});

		// biome-ignore lint/style/useTemplate: slightly faster
		const prefix = label ? label + "/" : "";
		return `${prefix}${level}: ${message} ${stringifiedRest}`;
	}),
);

const formatJson = format.combine(
	format.printf(({ level, message, timestamp, label, ...rest }) =>
		// biome-ignore lint/style/noNonNullAssertion: stringify only returns undefined for undefined input
		stringify({
			timestamp,
			level,
			...(label ? { label } : {}),
			message,
			request: rest.request ?? requestId(),
			...rest,
		})!,
	),
);

export const logger = createLogger({
	levels: logLevels.levels,
	defaultMeta: {},
	format: format.combine(
		format.timestamp(),
		format.errors({ stack: true }),
	),
	transports: [
    new transports.Console({
      format:
        // https://nodejs.org/api/tty.html#tty_tty
        process.stdout.isTTY ? formatPretty : formatJson,
		}),
	],
});
/* node:coverage enable */
