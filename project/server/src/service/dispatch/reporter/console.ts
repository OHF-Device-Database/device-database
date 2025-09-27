import type { IDispatchReporter } from "../base";

export class DispatchReporterConsole implements IDispatchReporter {
	/* c8 ignore start */
	error(error: Error): void {
		console.error(error);
	}
	/* c8 ignore stop */
}
