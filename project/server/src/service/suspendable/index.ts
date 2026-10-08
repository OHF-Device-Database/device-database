export type SuspendableResumeResult = {
	inert: boolean;
	remaining: { description?: string | undefined; tag?: string | undefined }[];
};

export interface ISuspendable {
	suspend(handle: SuspendableHandle): Promise<void>;
	resume(handle: SuspendableHandle): SuspendableResumeResult;
}

const SuspendableHandleSymbol = Symbol("SuspendableHandleSymbol");

export class SuspendableHandle {
	private readonly symbol: symbol;
	private readonly tag: string | undefined;

	public constructor(symbol: symbol, tag?: string | undefined) {
		this.symbol = symbol;
		this.tag = tag;
	}

	[SuspendableHandleSymbol]() {
		return {
			symbol: this.symbol,
			tag: this.tag,
		};
	}
}

type Suspend = { done: Promise<void>; resolve: () => void };

export abstract class Suspendable implements ISuspendable {
	private _suspended: Map<symbol, Map<string | undefined, Suspend>> = new Map();
	private _drained: PromiseWithResolvers<void> | undefined;

	/** finalizes currently running operation */
	abstract drain(): Promise<void>;

	/** parks the caller until suspendable {@link settles} */
	protected park(acting: boolean): Promise<void> {
		if (!acting) {
			return Promise.resolve();
		}

		this._drained ??= Promise.withResolvers<void>();

		return this._drained.promise;
	}

	/** releases every caller parked in {@link park} */
	protected settle(): void {
		const drained = this._drained;
		this._drained = undefined;

		drained?.resolve();
	}

	async suspended(): Promise<void> {
		// suspensions may be registered while waiting for the currently registered ones to release
		while (true) {
			const unrolled = [...this.all()];
			if (unrolled.length === 0) {
				return;
			}

			await Promise.all(unrolled);
		}
	}

	public suspensions(): [symbol: symbol, tag: string | undefined][] {
		return [
			...this._suspended
				.entries()
				.flatMap(([key, value]) =>
					value.keys().map<[symbol, string | undefined]>((tag) => [key, tag]),
				),
		] as const;
	}

	public get resumed(): boolean {
		return this._suspended.size === 0;
	}

	private all() {
		return this._suspended
			.values()
			.flatMap((nested) => nested.values().map((item) => item.done));
	}

	public async suspend(handle: SuspendableHandle): Promise<void> {
		const { symbol, tag } = handle[SuspendableHandleSymbol]();

		const { resolve: _resolve, promise: done } = Promise.withResolvers<void>();
		const resolve = () => {
			const bucket = this._suspended.get(symbol);
			bucket?.delete(tag);
			if (bucket?.size === 0) {
				this._suspended.delete(symbol);
			}

			_resolve();
		};

		const bucket = this._suspended.get(symbol);
		if (typeof bucket === "undefined") {
			this._suspended.set(symbol, new Map([[tag, { done, resolve }]]));
		} else {
			const suspend = bucket.get(tag);
			if (typeof suspend === "undefined") {
				bucket.set(tag, { done, resolve });
			} else {
				return;
			}
		}

		await this.drain();
	}

	public resume(handle: SuspendableHandle): SuspendableResumeResult {
		const { symbol, tag } = handle[SuspendableHandleSymbol]();

		const suspend = this._suspended.get(symbol)?.get(tag);

		// removes suspend from `this._suspend`
		suspend?.resolve();

		const remaining = [
			...this._suspended
				.entries()
				.flatMap(([symbol, scoped]) =>
					scoped
						.keys()
						.map((tag) => ({ description: symbol.description, tag })),
				),
		];

		return { inert: typeof suspend === "undefined", remaining };
	}
}
