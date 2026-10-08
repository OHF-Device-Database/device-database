export const AbortedSymbol = Symbol("Aborted");
export type AbortedSymbol = typeof AbortedSymbol;

/** `abort` is dispatched at most once per signal, so a listener registered with `once` is only ever removed by the abort itself
 * registering one per call would accumulate listeners on long lived signals
 *
 * memoizing keeps it at one listener per signal
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal#removing_the_abort_event_listener */
const pending = new WeakMap<AbortSignal, Promise<AbortedSymbol>>();

/** resolves once `signal` aborts, and never otherwise — meant to be raced
 *
 * only supports signals managed by {@link AbortController} */
export const aborted = (signal: AbortSignal): Promise<AbortedSymbol> => {
	const memoized = pending.get(signal);
	if (typeof memoized !== "undefined") {
		return memoized;
	}

	// `abort` has already been dispatched, a listener registered now never fires
	if (signal.aborted) {
		const done = Promise.resolve(AbortedSymbol);
		pending.set(signal, done);

		return done;
	}

	const { resolve, promise: done } = Promise.withResolvers<AbortedSymbol>();
	signal.addEventListener("abort", () => resolve(AbortedSymbol), {
		once: true,
	});
	pending.set(signal, done);

	return done;
};
