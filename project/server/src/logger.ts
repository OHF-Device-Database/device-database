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

export const logger = createLogger({
	levels: logLevels.levels,
	defaultMeta: {},
	format: format.combine(
		format.timestamp(),
		format.errors({ stack: true }),
		format.json(),
	),
	transports: [
		new transports.Console({
			format: format.combine(
				format.colorize(),
				format.printf(({ level, message, label, ...rest }) => {
					// `JSON.stringify` can't deal with `BigInt`
					// https://github.com/winstonjs/logform/blob/fdc37d1592d9911d7c34f4bb1bca9eb70476995a/simple.js#L18
					const stringifiedRest = stringify({
						...rest,
						// request identifier might already be set explicitly (e.g. in `request-log` middleware)
						// if not, extract request identifier from request storage
						request:
							rest.request ??
							requestStorage
								.getStore()
								?.scope<string>(MiddlewareRequestStorageDomain)
								?.get(),
					});

					// biome-ignore lint/style/useTemplate: slightly faster
					const prefix = label ? label + "/" : "";
					return `${prefix}${level}: ${message} ${stringifiedRest}`;
				}),
			),
		}),
	],
});
/* node:coverage enable */
