import type { EventEmitter } from "node:stream";

type Event = Record<string | symbol, unknown>;

/** helper that introduces a typed `_emit` function, and constrained typing for `on` / `once`
 *
 * due to limitations in how typescript chooses overloads, emits using `emit` can't be fully constrained.
 * the more specific overload is ignored in favor of less specific one, that does not impose a constraint on the event argument when the constraint is violated.
 * the less specific one is necessary to support emits of events that are legitimately untyped and / or occur downstream.
 *
 * the type contract therefor does not hold when regular `emit` is called with unexpected event arguments
 *
 * _it does hold_, when `_emit` is used
 *
 * events for which an overload is already defined in base class (e.g. "data") can't be hinted
 */
export const HintedEventEmitter =
	<E extends Event>() =>
	// biome-ignore lint/suspicious/noExplicitAny: constructor typing can't be more precise
	<Base extends new (...args: any[]) => EventEmitter>(base: Base) => {
		// casting shenanigans don't work here, mixin therefor the only approach
		// https://github.com/microsoft/TypeScript/issues/29732#event-5978464431
		return class extends base {
			protected _emit<K extends (keyof E & string) | symbol>(
				event: K,
				arg: E[K],
			): boolean {
				return super.emit(event, arg);
			}

			on<K extends keyof E>(event: K, listener: (arg: E[K]) => void): this;
			on(
				event: Exclude<string | symbol, (keyof E & string) | symbol>,
				// biome-ignore lint/suspicious/noExplicitAny: must match base class signature
				listener: (...args: any[]) => void,
			): this;
			override on(
				event: string | symbol,
				// biome-ignore lint/suspicious/noExplicitAny: ↑
				listener: (...args: any[]) => void,
			): this {
				return super.on(event, listener);
			}

			once<K extends keyof E>(event: K, listener: (arg: E[K]) => void): this;
			once(
				event: Exclude<string | symbol, (keyof E & string) | symbol>,
				// biome-ignore lint/suspicious/noExplicitAny: must match base class signature
				listener: (...args: any[]) => void,
			): this;
			override once(
				event: string | symbol,
				// biome-ignore lint/suspicious/noExplicitAny: must match base class signature
				listener: (...args: any[]) => void,
			): this {
				return super.once(event, listener);
			}
		};
	};
