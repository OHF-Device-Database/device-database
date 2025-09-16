export async function unroll<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const buffer: T[] = [];

	for await (const item of iterable) {
		buffer.push(item);
	}

	return buffer;
}
