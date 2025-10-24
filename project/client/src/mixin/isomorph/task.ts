// adapted from https://github.com/lit/lit/blob/main/packages/task/src/task.ts
// allows setting the inner value

import { shallowArrayEquals } from "@lit/task";

import type { ReactiveControllerHost } from "@lit/reactive-element/reactive-controller.js";
import type { Fetch } from "../../api/base";
import { ContextConsumer } from "@lit/context";
import { ContextFetch } from "../../context/fetch";

export type MixinIsomorphTaskContext = {
	fetch: Fetch;
};

type TaskFunctionContext = MixinIsomorphTaskContext & {
	signal: AbortSignal | undefined;
};

export type MixinIsomorphTaskConfiguration<
	ArgumentsResult extends ReadonlyArray<unknown>,
	TaskResult,
> = {
	taskFn: (
		args: ArgumentsResult,
		context: TaskFunctionContext
	) => Promise<TaskResult>;
	argsFn: () => ArgumentsResult;
	argsEqualFn?: (
		previous: ArgumentsResult,
		current: ArgumentsResult
	) => boolean;
};

type TaskStatusInitial = { kind: "initial" };
type TaskStatusPending = { kind: "pending" };
type TaskStatusComplete<T> = { kind: "complete"; value: T };
type TaskStatusError = { kind: "error"; error: unknown };
type TaskStatus<T> =
	| TaskStatusInitial
	| TaskStatusPending
	| TaskStatusComplete<T>
	| TaskStatusError;

type MaybeReturnType<F> = F extends (...args: never[]) => infer R
	? R
	: undefined;

type StatusRenderer<R> = {
	initial?: () => unknown;
	pending?: () => unknown;
	complete?: (value: R) => unknown;
	error?: (error: unknown) => unknown;
};

export class MixinIsomorphTask<
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- false positive
	ArgumentsResult extends ReadonlyArray<unknown> | never,
	TaskResult,
> {
	private _host: ReactiveControllerHost;
	private _configuration: MixinIsomorphTaskConfiguration<
		ArgumentsResult,
		TaskResult
	>;

	private _previousArgs: ArgumentsResult | undefined;
	private _callId = 0;
	private _status: TaskStatus<TaskResult>;
	private _abortController?: AbortController;

	private consumeFetch: ContextConsumer<
		typeof ContextFetch,
		ReactiveControllerHost & HTMLElement
	>;

	constructor(
		host: ReactiveControllerHost & HTMLElement,
		configuration: MixinIsomorphTaskConfiguration<ArgumentsResult, TaskResult>,
		completion?: [ArgumentsResult, TaskResult]
	) {
		(this._host = host).addController(this);
		this._configuration = configuration;

		this.consumeFetch = new ContextConsumer(host, { context: ContextFetch });

		if (typeof completion !== "undefined") {
			this._previousArgs = completion[0];
			this._status = { kind: "complete", value: completion[1] };
		} else {
			this._status = { kind: "initial" };
		}
	}

	public static async run<
		ArgumentsResult extends ReadonlyArray<unknown>,
		TaskResult,
	>(
		configuration: MixinIsomorphTaskConfiguration<ArgumentsResult, TaskResult>,
		context: MixinIsomorphTaskContext
	): Promise<[ArgumentsResult, TaskResult]> {
		const taskFnContext: TaskFunctionContext = {
			...context,
			signal: undefined,
		};

		const args = configuration.argsFn();
		return [args, await configuration.taskFn(args, taskFnContext)] as const;
	}

	hostUpdate() {
		void this._performTask();
	}

	private argsEqual(
		previous: ArgumentsResult | undefined,
		current: ArgumentsResult
	): boolean {
		if (typeof previous === "undefined") {
			return false;
		}

		if (
			"argsEqualFn" in this._configuration &&
			typeof this._configuration.argsEqualFn !== "undefined"
		) {
			return this._configuration.argsEqualFn(previous, current);
		}

		return shallowArrayEquals(previous, current);
	}

	private async _performTask() {
		let args: ArgumentsResult | undefined;
		guard: {
			const previous = this._previousArgs;
			const current = this._configuration.argsFn();
			this._previousArgs = current;

			if (!this.argsEqual(previous, current)) {
				args = current;
				break guard;
			} else {
				return;
			}
		}

		await this.run(args);
	}

	async run(args?: ArgumentsResult) {
		if (this._status.kind === "pending") {
			this._abortController?.abort();
		}

		this._status = { kind: "pending" };
		let result!: TaskResult;
		let error: unknown;

		this._host.requestUpdate();

		const key = ++this._callId;
		this._abortController = new AbortController();
		let errored = false;
		try {
			const context: TaskFunctionContext = {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed to be set by this point
				fetch: this.consumeFetch.value!,
				signal: this._abortController.signal,
			};

			const narrowedArgs = args ?? this._configuration.argsFn();
			this._previousArgs = narrowedArgs;
			result = await this._configuration.taskFn(narrowedArgs, context);
		} catch (e) {
			errored = true;
			error = e;
		}
		// if this is the most recent task call, process this value
		if (this._callId === key) {
			if (!errored) {
				this._status = { kind: "complete", value: result };
			} else {
				this._status = { kind: "error", error };
			}

			// request an update with the final value
			this._host.requestUpdate();
		}
	}

	abort(reason?: unknown) {
		if (this._status.kind === "pending") {
			this._abortController?.abort(reason);
		}
	}

	complete(args: ArgumentsResult, value: TaskResult) {
		this._previousArgs = args;
		this._status = { kind: "complete", value };
		this._host.requestUpdate();
	}

	get status(): TaskStatus<TaskResult> {
		return this._status;
	}

	render<T extends StatusRenderer<TaskResult>>(renderer: T) {
		switch (this._status.kind) {
			case "initial":
				return renderer.initial?.() as MaybeReturnType<T["initial"]>;
			case "pending":
				return renderer.pending?.() as MaybeReturnType<T["pending"]>;
			case "complete":
				return renderer.complete?.(this._status.value) as MaybeReturnType<
					T["complete"]
				>;
			case "error":
				return renderer.error?.(this._status.error) as MaybeReturnType<
					T["error"]
				>;
		}
	}
}
