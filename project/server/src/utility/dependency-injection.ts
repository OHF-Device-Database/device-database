import {
	type Constructor,
	createType,
	inject,
	optional,
	type Type,
} from "@lppedd/di-wise-neo";

// biome-ignore lint/suspicious/noExplicitAny: vendored from di-wise-neo
type Token<Value = any> = [Value] extends [object]
	? Type<Value> | Constructor<Value>
	: Type<Value>;

const NoOp = createType<never>("NoOp");

/** provides either a registed value for the provided token or a provided stub if resolution failed */
export const injectOrStub = <T>(token: Token<T>, stub: () => T): T => {
	// attempt to resolve a token that is never satisfiable
	// di-wise-neo throws when injecting (both required and optional) when no injection context exists
	// it also does not provide a way to detect if an injection context exists
	// by attempting a resolution that is always unsatisfiable, one can accurately determine a lack of injection context
	let containerExists = true;
	try {
		optional(NoOp);
	} catch {
		containerExists = false;
	}

	if (containerExists) {
		return inject(token);
	}

	return stub();
};
