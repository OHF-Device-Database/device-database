import type {
	DatabaseSync,
	FunctionOptions,
	SQLInputValue,
	SQLOutputValue,
} from "node:sqlite";

import { omit } from "../../utility/omit";

const corporateDesignator =
	/,?(?:(?: +| ?& ?|, ?| \+ )(?:b\.?v\.?|gmbh|kg|co\.?|inc\.?|ag|ltd\.?|a\/?s|sas|corp\.?|corporation|limited|ab|llc|s\.p\.a\.|sa|nv|s\.r\.o))+$/i;

export const std = {
	nfkc: {
		deterministic: true,
		fn: (text: SQLOutputValue) =>
			typeof text === "string" ? text.normalize("NFKC") : null,
	},
	// built-in trim only removes literal space characters, not whitespace generally
	trim: {
		deterministic: true,
		fn: (text: SQLOutputValue) =>
			typeof text === "string" ? text.trim() : null,
	},
	// built-in lower only deals with ascii characters, while leaving any characters outside of range untouched
	lower: {
		deterministic: true,
		fn: (text: SQLOutputValue) =>
			typeof text === "string" ? text.toLowerCase() : null,
	},
	// built-in upper only deals with ascii characters, while leaving any characters outside of range untouched
	upper: {
		deterministic: true,
		fn: (text: SQLOutputValue) =>
			typeof text === "string" ? text.toUpperCase() : null,
	},
	strip_corporate_designator: {
		deterministic: true,
		fn: (text: SQLOutputValue) =>
			typeof text === "string" ? text.replace(corporateDesignator, "") : null,
	},
} as const satisfies Record<
	string,
	FunctionOptions & { fn: (...args: SQLOutputValue[]) => SQLInputValue }
>;

export const stdLoad = (db: DatabaseSync) => {
	for (const [name, definition] of Object.entries(std)) {
		db.function(`std_${name}`, omit(definition, "fn"), definition.fn);
	}
};
