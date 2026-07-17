import race from "./race-as-promised";

export async function* progressively<I, T extends Promise<I>>(
	values: Iterable<T>,
	// biome-ignore lint/suspicious/noExplicitAny: distributive union
): AsyncIterable<T extends any ? Awaited<T> : never> {
	const done: Set<number> = new Set();

	let idx = 0;
	const wrapped: Promise<[unknown, number]>[] = [];
	for (const bound of values) {
		// otherwise incrementing `idx` from outer scope is **referenced**, and not copied
		const i = idx;
		wrapped.push(
			(async () => {
				return [await bound, i] as const;
			})(),
		);
		idx += 1;
	}

	while (done.size < wrapped.length) {
		const contenders = wrapped.flatMap((value, idx) =>
			done.has(idx) ? [] : [value],
		);

		const [value, idx] = await (contenders.length > 1
			? race(contenders)
			: contenders[0]);

		done.add(idx);

		// biome-ignore lint/suspicious/noExplicitAny: return type is distributive union, can't be specified more precisely
		yield value as any;
	}
}
