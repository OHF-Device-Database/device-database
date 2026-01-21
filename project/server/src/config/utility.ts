import { lstatSync } from "node:fs";
import { resolve } from "node:path";

import { Schema } from "effect/index";

import { Integer } from "../type/codec/integer";

import type { Maybe } from "../type/maybe";

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

type Env<K> =
	| { kind: "sourced"; value: string }
	| { kind: "default"; value: K }
	| { kind: "optional"; value?: string | undefined };

/* node:coverage disable */
const environment = <K>(key: Key<K>): Env<K> => {
	if (RequiredSymbol in key) {
		const peeked = key[RequiredSymbol];
		const name = peeked.key;
		const result = process.env[peeked.key];

		if (typeof result !== "undefined") {
			return { kind: "sourced", value: result };
		}

		if (typeof peeked.defaultValue !== "undefined") {
			return { kind: "default", value: peeked.defaultValue };
		}

		console.error(`environment variable '${name}' not set`);
		process.exit(1);
	} else {
		const peeked = key[OptionalSymbol];
		return { kind: "optional", value: process.env[peeked.key] };
	}
};

const name = <T>(key: Key<T>): string =>
	RequiredSymbol in key ? key[RequiredSymbol].key : key[OptionalSymbol].key;

type Key<T> = KeyRequired<T> | KeyOptional<T>;

export const required = <T>(key: string, defaultValue?: T): KeyRequired<T> => ({
	[RequiredSymbol]: { key, defaultValue },
});
export const optional = <T>(key: string): KeyOptional<T> => ({
	[OptionalSymbol]: { key },
});

export function envString(key: KeyRequired<string>): string;
export function envString(key: KeyOptional<string>): Maybe<string>;
export function envString(key: Key<string>) {
	const env = environment(key);
	return env.value ?? null;
}

export function envInteger(key: KeyRequired<Integer>): Integer;
export function envInteger(key: KeyOptional<Integer>): Maybe<Integer>;
export function envInteger(key: Key<Integer>) {
	const env = environment(key);
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
				console.error(
					`environment variable '${name(key)}' should be integer, is '${env.value}'`,
				);
				process.exit(1);
			}

			return parsed;
		}
	}
}

export function envBoolean(key: KeyRequired<boolean>): boolean;
export function envBoolean(key: KeyOptional<boolean>): Maybe<boolean>;
export function envBoolean(key: Key<boolean>) {
	const env = environment(key);

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

	console.error(
		`environment variable '${name(key)}' should be 'true' or 'false'`,
	);
	process.exit(1);
}

/** converts base64 encoded environment variable contents into buffer */
export function envBuffer(key: KeyRequired<Buffer>): Buffer;
export function envBuffer(key: KeyOptional<Buffer>): Maybe<Buffer>;
export function envBuffer(key: Key<Buffer>) {
	const env = environment(key);
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
				console.error(`environment variable '${name(key)}' malformed`);
			}

			process.exit(1);
		}
	}
}

export function envPath(key: KeyRequired<string>): string;
export function envPath(key: KeyOptional<string>): Maybe<string>;
export function envPath(key: Key<string>) {
	const env = environment(key);

	const value = env.value;
	if (typeof value === "undefined") {
		return null;
	}

	let stat;
	try {
		stat = lstatSync(value);
	} catch {
		console.error(`environment variable '${name(key)}' inaccessible`);
		process.exit(1);
	}

	if (!stat.isFile) {
		console.error(`environment variable '${name(key)}' should specify a file`);
		process.exit(1);
	}

	return resolve(value);
}

export function envChoice<T extends { [key: string]: string }>(
	choices: Schema.Enums<T>,
): (key: KeyRequired<T[keyof T]>) => T[keyof T];
export function envChoice<T extends { [key: string]: string }>(
	choices: Schema.Enums<T>,
): (key: KeyRequired<T[keyof T]>) => Maybe<T[keyof T]>;
export function envChoice<T extends { [key: string]: string }>(
	choices: Schema.Enums<T>,
) {
	return (key: Key<T[keyof T]>) => {
		const env = environment(key);
		switch (env.kind) {
			case "default":
				return env.value;
			case "sourced":
			case "optional": {
				const guard = Schema.is(choices);

				if (!guard(env.value)) {
					console.error(
						`invalid choice for environment variable '${name(key)}' (allowed: ${Object.keys(choices.enums).join(", ")})`,
					);
					process.exit(1);
				}

				return env.value;
			}
		}
	};
}
/* node:coverage enable */
