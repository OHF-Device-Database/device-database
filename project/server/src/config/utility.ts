import { lstatSync } from "node:fs";
import { resolve } from "node:path";

import { Schema } from "effect/index";

import { Integer } from "../type/codec/integer";
import { isNone, type Maybe } from "../type/maybe";

const RequiredSymbol = Symbol("RequiredSymbol");
type KeyRequired<T> = {
	[RequiredSymbol]: {
		key: string;
		defaultValue?: T | undefined;
	};
};

const OptionalSymbol = Symbol("OptionalSymbol");
type KeyOptional<_T> = {
	[OptionalSymbol]: {
		key: string;
	};
};

export class EnvironmentIntegrityError extends Error {
	constructor(
		public key: Key<unknown>,
		public faulty: boolean,
		message: string,
	) {
		super(message);
		Object.setPrototypeOf(this, EnvironmentIntegrityError.prototype);
	}
}

export class EnvironmentUniteNoopError extends Error {
	constructor() {
		super(
			"unite consists exclusively of variables with default values and would therefor always be present",
		);
		Object.setPrototypeOf(this, EnvironmentUniteNoopError.prototype);
	}
}

type Env<K> =
	| { kind: "sourced"; value: string }
	| { kind: "default"; value: K }
	| { kind: "optional"; value?: string | undefined };

const name = <T>(key: Key<T>): string =>
	RequiredSymbol in key ? key[RequiredSymbol].key : key[OptionalSymbol].key;

type Key<T> = KeyRequired<T> | KeyOptional<T>;

export const required = <T>(key: string, defaultValue?: T): KeyRequired<T> => ({
	[RequiredSymbol]: { key, defaultValue },
});
export const optional = <T>(key: string): KeyOptional<T> => ({
	[OptionalSymbol]: { key },
});

type Encountered =
	| { kind: "required"; key: KeyRequired<unknown>; set: boolean }
	| { kind: "optional"; key: KeyOptional<unknown>; set: boolean };

export class Environment {
	readonly encountered: Encountered[] = [];

	constructor(
		private configuration: {
			prefix?: string | undefined;
			postfix?: string | undefined;
			/** should exit on missing required variable? */
			exit: boolean;
		},
	) {}

	private environment<K>(key: Key<K>): Env<K> {
		let variable = name(key);
		if (
			typeof this.configuration.prefix !== "undefined" &&
			this.configuration.prefix !== ""
		) {
			variable = `${this.configuration.prefix}_${variable}`;
		}
		if (
			typeof this.configuration.postfix !== "undefined" &&
			this.configuration.postfix !== ""
		) {
			variable = `${variable}_${this.configuration.postfix}`;
		}

		const result = process.env[variable];

		if (RequiredSymbol in key) {
			const peeked = key[RequiredSymbol];

			if (typeof result !== "undefined") {
				this.encountered.push({ kind: "required", key, set: true });
				return { kind: "sourced", value: result };
			}

			if (typeof peeked.defaultValue !== "undefined") {
				this.encountered.push({ kind: "required", key, set: false });
				return { kind: "default", value: peeked.defaultValue };
			}

			this.failure(key, false, `environment variable '${variable}' not set`);
		} else {
			this.encountered.push({
				kind: "optional",
				key,
				set: typeof result !== "undefined",
			});
			return { kind: "optional", value: result };
		}
	}

	failure(key: Key<unknown>, faulty: boolean, message: string): never {
		if (this.configuration.exit) {
			console.error(message);
			process.exit(1);
		}

		throw new EnvironmentIntegrityError(key, faulty, message);
	}

	string(key: KeyRequired<string>): string;
	string(key: KeyOptional<string>): Maybe<string>;
	string(key: Key<string>): string | Maybe<string>;
	string(key: Key<string>) {
		const env = this.environment(key);
		return env.value ?? null;
	}
	static string(key: KeyRequired<string>): string;
	static string(key: KeyOptional<string>): Maybe<string>;
	static string(key: Key<string>) {
		return new Environment({ exit: true }).string(key);
	}

	integer(key: KeyRequired<Integer>): Integer;
	integer(key: KeyOptional<Integer>): Maybe<Integer>;
	integer(key: Key<Integer>): Integer | Maybe<Integer>;
	integer(key: Key<Integer>) {
		const env = this.environment(key);
		switch (env.kind) {
			case "default":
				return env.value;
			case "sourced":
			case "optional": {
				if (typeof env.value === "undefined") {
					return null;
				}

				const parsed = Number(env.value);

				const guard = Schema.is(Integer);
				if (!guard(parsed)) {
					this.failure(
						key,
						true,
						`environment variable '${name(key)}' should be integer, is '${env.value}'`,
					);
				}

				return parsed;
			}
		}
	}
	static integer(key: KeyRequired<Integer>): Integer;
	static integer(key: KeyOptional<Integer>): Maybe<Integer>;
	static integer(key: Key<Integer>) {
		return new Environment({ exit: true }).integer(key);
	}

	boolean(key: KeyRequired<boolean>): boolean;
	boolean(key: KeyOptional<boolean>): Maybe<boolean>;
	boolean(key: Key<boolean>): boolean | Maybe<boolean>;
	boolean(key: Key<boolean>) {
		const env = this.environment(key);

		switch (env.kind) {
			case "default":
				return env.value;
			case "sourced":
			case "optional": {
				if (typeof env.value === "undefined") {
					return null;
				}

				if (env.value === "true") {
					return true;
				} else if (env.value === "false") {
					return false;
				}
			}
		}

		this.failure(
			key,
			true,
			`environment variable '${name(key)}' should be 'true' or 'false'`,
		);
	}
	static boolean(key: KeyRequired<boolean>): boolean;
	static boolean(key: KeyOptional<boolean>): Maybe<boolean>;
	static boolean(key: Key<boolean>) {
		return new Environment({ exit: true }).boolean(key);
	}

	buffer(key: KeyRequired<Buffer>): Buffer;
	buffer(key: KeyOptional<Buffer>): Maybe<Buffer>;
	buffer(key: Key<Buffer>): Buffer | Maybe<Buffer>;
	buffer(key: Key<Buffer>) {
		const env = this.environment(key);
		switch (env.kind) {
			case "default":
				return env.value;
			case "sourced":
			case "optional": {
				if (typeof env.value === "undefined") {
					return null;
				}

				const buf = Buffer.from(env.value, "base64");
				if (buf.length > 0) {
					return buf;
				} else if (env.value.length > 0) {
					this.failure(
						key,
						true,
						`environment variable '${name(key)}' malformed`,
					);
				}
			}
		}
	}
	/** converts base64 encoded environment variable contents into buffer */
	static buffer(key: KeyRequired<Buffer>): Buffer;
	static buffer(key: KeyOptional<Buffer>): Maybe<Buffer>;
	static buffer(key: Key<Buffer>) {
		return new Environment({ exit: true }).buffer(key);
	}

	path(key: KeyRequired<string>): string;
	path(key: KeyOptional<string>): Maybe<string>;
	path(key: Key<string>): string | Maybe<string>;
	path(key: Key<string>) {
		const env = this.environment(key);

		const value = env.value;
		if (typeof value === "undefined") {
			return null;
		}

		let stat;
		try {
			stat = lstatSync(value);
		} catch {
			this.failure(
				key,
				true,
				`environment variable '${name(key)}' inaccessible`,
			);
		}

		if (!stat.isFile) {
			this.failure(
				key,
				true,
				`environment variable '${name(key)}' should specify a file`,
			);
		}

		return resolve(value);
	}
	static path(key: KeyRequired<string>): string;
	static path(key: KeyOptional<string>): Maybe<string>;
	static path(key: Key<string>) {
		return new Environment({ exit: true }).path(key);
	}

	choice = <const T extends { [key: string]: string }>(
		choices: Schema.Enums<T>,
	): {
		(key: KeyRequired<T[keyof T]>): T[keyof T];
		(key: KeyOptional<T[keyof T]>): Maybe<T[keyof T]>;
	} => {
		return (key: Key<T[keyof T]>) => {
			const env = this.environment(key);
			switch (env.kind) {
				case "default":
					return env.value;
				case "sourced":
				case "optional": {
					if (typeof env.value === "undefined") {
						// biome-ignore lint/suspicious/noExplicitAny: casting to intersection type also causes type error
						return null as any;
					}

					const guard = Schema.is(choices);

					if (!guard(env.value)) {
						this.failure(
							key,
							true,
							`invalid choice for environment variable '${name(key)}' (allowed: ${Object.keys(choices.enums).join(", ")})`,
						);
					}

					return env.value;
				}
			}
		};
	};
	static choice = <const T extends { [key: string]: string }>(
		choices: Schema.Enums<T>,
	): {
		(key: KeyRequired<T[keyof T]>): T[keyof T];
		(key: KeyOptional<T[keyof T]>): Maybe<T[keyof T]>;
	} => {
		return new Environment({ exit: true }).choice(choices);
	};

	/** ensures that either all required environment variables within scope are set, or none of them */
	unite<R>(prefix: string, scope: (env: Environment) => R): Maybe<R> {
		let concatenated = prefix;
		if (
			typeof this.configuration.prefix !== "undefined" &&
			this.configuration.prefix !== ""
		) {
			concatenated = `${this.configuration.prefix}_${prefix}`;
		}

		const env = new Environment({
			prefix: concatenated,
			postfix: this.configuration.postfix,
			exit: false,
		});

		let result;
		try {
			result = scope(env);
		} catch (e) {
			if (e instanceof EnvironmentIntegrityError) {
				// suppress unset variable errors, but pass on faulty variable ones
				if (e.faulty) {
					this.failure(e.key, e.faulty, e.message);
				}

				return null;
			}

			throw e;
		}

		// don't allow uniting scope that consists exclusively of required variables with provided default values
		// exclusively nested unite(s) result in no encounters → don't consider as noop
		let noop = env.encountered.length > 0;
		for (const e of env.encountered) {
			if (
				!(
					RequiredSymbol in e.key &&
					typeof e.key[RequiredSymbol].defaultValue !== "undefined"
				)
			) {
				noop = false;
				break;
			}
		}

		if (noop) {
			throw new EnvironmentUniteNoopError();
		}

		return result;
	}
	/** ensures that either all required environment variables within scope are set, or none of them */
	static unite<R>(prefix: string, scope: (env: Environment) => R): Maybe<R> {
		return new Environment({ exit: true }).unite(prefix, scope);
	}

	private static *postfixes() {
		yield undefined;
		for (let i = 1; i < Number.MAX_SAFE_INTEGER; i++) {
			yield `${i}`;
		}
	}

	many<R>(
		scope: (env: Environment) => R,
	): ([R] extends [Maybe<infer _R>] ? _R : R)[] {
		type Wanted = [R] extends [Maybe<infer _R>] ? _R : R;
		const found: Wanted[] = [];
		for (const postfix of Environment.postfixes()) {
			const env = new Environment({
				prefix: this.configuration.prefix,
				postfix,
				exit: false,
			});

			let result;
			try {
				result = scope(env);
			} catch (e) {
				if (e instanceof EnvironmentIntegrityError) {
					// suppress unset variable errors, but pass on faulty variable ones
					if (e.faulty) {
						this.failure(e.key, e.faulty, e.message);
					}

					return found;
				}

				throw e;
			}

			// united / optional
			if (isNone(result)) {
				return found;
			}

			// prevent looping through all postfixes when all encountered variables have a defined default value
			// exclusively nested unite(s) result in no encounters → don't consider as noop
			let defaulted = env.encountered.length > 0;
			for (const e of env.encountered) {
				if (e.set) {
					defaulted = false;
					break;
				}
			}
			if (defaulted) {
				return found;
			}

			found.push(result as Wanted);
		}

		return found;
	}

	static many<R>(
		scope: (env: Environment) => R,
	): ([R] extends [Maybe<infer _R>] ? _R : R)[] {
		return new Environment({ exit: true }).many(scope);
	}
}

export { Environment as env };
