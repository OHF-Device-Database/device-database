import type { IDispatchReporter } from "../base";

export class DispatchReporterConsole implements IDispatchReporter {
	/* node:coverage disable */
	error(error: Error): void {
		console.error(error);
	}
	/* node:coverage enable */
}
