/** replaceable for testing */
export type IndexFetch = (
	input: string,
	init?: { headers?: Record<string, string> },
) => Promise<Response>;

export type IndexPacing = {
	/** minimum time between requests — in milliseconds */
	interval: number;
	/** rate limited responses retried before giving up */
	retries?: number;
	/** replaceable for testing */
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
};

/**
 * serializes requests, spaces them out, and waits out rate limits
 *
 * https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately
 */
export const paced = (
	fetch: IndexFetch,
	{
		interval,
		retries = 5,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		now = Date.now,
	}: IndexPacing,
): IndexFetch => {
	let queue: Promise<unknown> = Promise.resolve();
	/** epoch milliseconds the next request may go out at */
	let earliest = 0;

	return (input, init) => {
		const pending = queue.then(async () => {
			for (let attempt = 0; ; attempt++) {
				const wait = earliest - now();
				if (wait > 0) {
					await sleep(wait);
				}

				const response = await fetch(input, init);
				earliest = now() + interval;

				const remaining = response.headers.get("x-ratelimit-remaining");
				const reset = response.headers.get("x-ratelimit-reset");
				const after = response.headers.get("retry-after");

				// primary limit exhausted, holds for subsequent requests regardless of this one's outcome
				if (remaining === "0" && reset !== null) {
					earliest = Math.max(earliest, Number(reset) * 1000);
				}

				const limited =
					response.status === 429 ||
					(response.status === 403 && (remaining === "0" || after !== null));
				if (!limited || attempt >= retries) {
					return response;
				}

				if (after !== null) {
					earliest = Math.max(earliest, now() + Number(after) * 1000);
				} else if (remaining !== "0") {
					// secondary limit without hint, at least a minute and exponentially more when hit repeatedly
					earliest = Math.max(earliest, now() + 60_000 * 2 ** attempt);
				}

				await response.body?.cancel();
			}
		});

		// a failed request mustn't stall the ones queued behind it
		queue = pending.catch(() => {});
		return pending;
	};
};
