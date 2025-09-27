import { createType } from "@lppedd/di-wise-neo";

export interface IDispatchReporter {
	error(error: Error): void;
}

export const IDispatchReporter =
	createType<IDispatchReporter>("IDispatchReporter");
