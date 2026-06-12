import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { stringify } from "yaml";

const args = parseArgs({
	options: {
		"categories-file": { type: "string", default: "categories.json" },
		out: { type: "string", default: "out/spec.yaml" },
	},
});

const {
	values: { "categories-file": categoriesFile, out },
} = args;

const identifiers: Set<string> = new Set();
{
	type Category = {
		name: string;
		children: Record<string, Category>;
	};
	const parsed: Record<string, Category> = JSON.parse(
		await readFile(categoriesFile, "utf-8"),
	);

	const visit = (children: Record<string, Category>) => {
		for (const [id, category] of Object.entries(children)) {
			identifiers.add(id);
			visit(category.children);
		}
	};

	visit(parsed);
}

await writeFile(
	out,
	stringify({ Category: { type: "string", enum: [...identifiers] } }),
);
