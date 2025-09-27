import { createType, inject } from "@lppedd/di-wise-neo";

import { IDispatchReporter } from "./base";

type BoundPromise = () => Promise<unknown>;

export const IDispatch = createType<IDispatch>("IDispatch");

export type IDispatch = {
	now(bound: BoundPromise): void;
};

export const coerceError = (error: unknown): Error => {
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
};

export class Dispatch implements IDispatch {
	constructor(private reporter = inject(IDispatchReporter)) {}

	now(bound: BoundPromise): void {
		bound().catch((e) => this.reporter.error(coerceError(e)));
	}
}
