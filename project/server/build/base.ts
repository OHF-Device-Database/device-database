import { readFileSync } from "node:fs";

export const OUT_DIR = "out";

// every declared dependency *except* linked ones (e.g. workspace packages), because they aren't yet transpiled
// imports stay bare specifiers, so bundles work with any `node_modules` layout (pnpm workspace, `pnpm deploy`)
// subpath imports of packages without an `exports` map need an explicit extension (e.g. `stream-json/Parser.js`)
export const externalDependencies = (): string[] => {
	const {
		dependencies = {},
		devDependencies = {},
	}: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	} = JSON.parse(readFileSync("package.json", "utf8"));

	return Object.entries({ ...devDependencies, ...dependencies }).flatMap(
		([name, specifier]) =>
			/^(workspace|link|file):/.test(specifier) ? [] : [name],
	);
};
