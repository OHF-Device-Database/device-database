import { AsyncLocalStorage } from "node:async_hooks";

import stringify from "safe-stable-stringify";

type RequestStorageScopeToken<_T> = {
	domain: symbol;
	key: bigint | boolean | number | string | symbol;
};

class RequestStorageScope<T> {
	private value: T;

	constructor(value: T) {
		this.value = value;
	}

	get(): T {
		return this.value;
	}

	set(value: T) {
		this.value = value;
	}
}

export class RequestStorageUnserializableKeyError extends Error {
	/* c8 ignore start */
	constructor(public key: unknown) {
		super(`key "${key}" unserializable`);
		Object.setPrototypeOf(this, RequestStorageUnserializableKeyError.prototype);
	}
	/* c8 ignore stop */
}

const serializer = stringify.configure({ deterministic: true, strict: true });

const RequestStorageAbortController = Symbol("RequestStorageAbortController");

export class RequestStorage {
	/** identified by combination of domain and key */
	private keyed: Map<symbol, Map<unknown, RequestStorageScope<unknown>>> =
		new Map();
	/** identified only by domain */
	private unkeyed: Map<symbol, RequestStorageScope<unknown>> = new Map();

	private static serializeKey(
		// biome-ignore lint/suspicious/noExplicitAny: type checking perfomed at runtime
		key: any,
	): bigint | boolean | number | string | symbol {
		const keyType = typeof key;
		switch (keyType) {
			case "undefined":
			case "function":
				throw new RequestStorageUnserializableKeyError(key);
			case "object":
				// biome-ignore lint/style/noNonNullAssertion: can't return `undefined` unless provided with
				return serializer(key)!;
			case "bigint":
			case "boolean":
			case "number":
			case "string":
			case "symbol":
				return key;
		}
	}

	static token<T>(domain: symbol) {
		return <B>(key: B): RequestStorageScopeToken<T> => ({
			domain: domain,
			key: RequestStorage.serializeKey(key),
		});
	}

	public scope<T>(domain: symbol): RequestStorageScope<T | undefined>;
	public scope<T>(
		token: RequestStorageScopeToken<T>,
	): RequestStorageScope<T | undefined>;
	public scope(
		arg0: symbol | RequestStorageScopeToken<unknown>,
	): RequestStorageScope<unknown | undefined> {
		if (typeof arg0 === "symbol") {
			const unkeyed = this.unkeyed.get(arg0);
			if (typeof unkeyed !== "undefined") {
				return unkeyed;
			}

			const scope = new RequestStorageScope(undefined);
			this.unkeyed.set(arg0, scope);

			return scope;
		}

		const keyed = this.keyed.get(arg0.domain);
		if (typeof keyed === "undefined") {
			const scope = new RequestStorageScope(undefined);
			this.keyed.set(arg0.domain, new Map([[arg0.key, scope]]));

			return scope;
		}

		// biome-ignore lint/style/noNonNullAssertion: scope is created in the initial `undefined` checking branch
		return keyed.get(arg0.key)!;
	}

	public abortController(): AbortController {
		const scope = this.scope<AbortController>(RequestStorageAbortController);

		const current = scope.get();
		if (typeof current === "undefined") {
			const created = new AbortController();
			scope.set(created);
			return created;
		}

		return current;
	}
}

/** typed helper for async local storage */
export const requestStorage = new AsyncLocalStorage<RequestStorage>();

/** request-scoped `AbortController` */
export const abortController = () =>
	requestStorage.getStore()?.abortController();
