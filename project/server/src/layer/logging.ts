import { ConsoleLogger } from "@nestjs/common";

import { logger, type logLevels } from "./../logger";

type LogLevel = keyof (typeof logLevels)["levels"];

const kebabCase = (pascalCase: string) =>
	pascalCase
		.replace(/([a-z\d])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();

/** biome-ignore-start lint/suspicious/noExplicitAny: base class types  */

/** adapts log lines produced by nestjs internals
 *
 * intentionally does not override `.error` to prevent mangling error context
 * also delegates to base class when context is not provided
 */
export class AdapterLogger extends ConsoleLogger {
	/** forwards to the given app logger level, reporting whether the line was adapted
	 *
	 * a line is only adapted when the sole optional param is the context
	 */
	private adapt(
		level: LogLevel,
		message: any,
		optionalParams: [...any, string?],
	): boolean {
		if (optionalParams.length !== 1 || typeof optionalParams[0] !== "string") {
			return false;
		}

		logger[level](message, { label: kebabCase(optionalParams[0]) });
		return true;
	}

	log(message: any, context?: string): void;
	log(message: any, ...optionalParams: [...any, string?]): void;
	override log(message: any, ...optionalParams: [...any, string?]): void {
		if (!this.adapt("info", message, optionalParams)) {
			super.log(message, ...optionalParams);
		}
	}

	warn(message: any, context?: string): void;
	warn(message: any, ...optionalParams: [...any, string?]): void;
	override warn(message: any, ...optionalParams: [...any, string?]): void {
		if (!this.adapt("warn", message, optionalParams)) {
			super.warn(message, ...optionalParams);
		}
	}

	debug(message: any, context?: string): void;
	debug(message: any, ...optionalParams: [...any, string?]): void;
	override debug(message: any, ...optionalParams: [...any, string?]): void {
		if (!this.adapt("debug", message, optionalParams)) {
			super.debug(message, ...optionalParams);
		}
	}

	verbose(message: any, context?: string): void;
	verbose(message: any, ...optionalParams: [...any, string?]): void;
	override verbose(message: any, ...optionalParams: [...any, string?]): void {
		if (!this.adapt("verbose", message, optionalParams)) {
			super.verbose(message, ...optionalParams);
		}
	}

	fatal(message: any, context?: string): void;
	fatal(message: any, ...optionalParams: [...any, string?]): void;
	override fatal(message: any, ...optionalParams: [...any, string?]): void {
		if (!this.adapt("error", message, optionalParams)) {
			super.fatal(message, ...optionalParams);
		}
	}
}

/** biome-ignore-end lint/suspicious/noExplicitAny: ↑  */
