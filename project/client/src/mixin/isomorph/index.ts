import type { LitElement } from "lit";
import { ContextConsumer } from "@lit/context";

import type { Constructor } from "../../type/constructor";

import { ContextFetch } from "../../context/fetch";
import type {
	MixinIsomorphTaskConfiguration,
	MixinIsomorphTaskContext,
} from "./task";
import { MixinIsomorphTask } from "./task";
import type { SsrResolve } from "../../context/ssr/resolve";
import { ContextSsrResolve } from "../../context/ssr/resolve";
import { ContextSsrResolved } from "../../context/ssr/resolved";

export const MixinIsomorph = <T extends Constructor<LitElement>>(
	superClass: T
) =>
	class MixinIsomorph extends superClass {
		// context only becomes available once `.connectedCallback` is called
		// requires `resolve` and `io` context
		private _resolving: ((
			resolve: SsrResolve,
			context: MixinIsomorphTaskContext
		) => unknown)[] = [];
		// requires `resolved` context
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unknown is too specific in this context
		private _completing: [LocationToken, MixinIsomorphTask<any, any>][] = [];

		private _consumer = {
			fetch: new ContextConsumer(this, { context: ContextFetch }),
			resolve: new ContextConsumer(this, {
				context: ContextSsrResolve,
			}),
			resolved: new ContextConsumer(this, {
				context: ContextSsrResolved,
			}),
		} as const;

		// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any -- required by typescript
		constructor(...args: any[]) {
			super();
		}

		override connectedCallback(): void {
			super.connectedCallback();

			// first ssr render pass "discovers" tasks that need to be resolved
			const resolve = this._consumer.resolve.value;
			if (typeof resolve !== "undefined") {
				for (const task of this._resolving) {
					const context: MixinIsomorphTaskContext = {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- value is resolved upon callback connect
						fetch: this._consumer.fetch.value!,
					};

					task(resolve, context);
				}
			}

			// second ssr pass picks up the resolved dispatches from the first pass
			// script-defined variables are unavailable during ssr, so they are instead injected through a context
			const resolved = this._consumer.resolved.value;
			if (typeof resolved !== "undefined") {
				for (const [locationToken, task] of this._completing) {
					const pair = resolved[locationToken];
					if (typeof pair === "undefined") {
						continue;
					}

					task.complete(pair[0], pair[1]);
				}
			}
		}

		protected task<ArgumentsResult extends ReadonlyArray<unknown>, TaskResult>(
			locationToken: LocationToken,
			configuration: MixinIsomorphTaskConfiguration<ArgumentsResult, TaskResult>
		): MixinIsomorphTask<ArgumentsResult, TaskResult> {
			const task = new MixinIsomorphTask(this, configuration);

			if (SSR) {
				this._resolving.push((resolve, context) => {
					resolve(locationToken, async () =>
						MixinIsomorphTask.run(configuration, context)
					);
				});
				this._completing.push([locationToken, task] as const);
			} else if (typeof RESOLVED !== "undefined") {
				// uses script-defined global variable to complete task, because context only becomes
				// available *after* the first render, leading to an unnecessary interim state
				// before transitioning to complete
				const pair = RESOLVED[locationToken];
				if (typeof pair !== "undefined") {
					task.complete(pair[0] as ArgumentsResult, pair[1] as TaskResult);
				}
			}

			return task;
		}
	};
