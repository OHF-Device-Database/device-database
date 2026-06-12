import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const args = parseArgs({
	options: {
		"categories-file": { type: "string", default: "categories.json" },
		out: { type: "string", default: "out/typescript/categories.ts" },
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

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

await writeFile(
	out,
	`export enum Category {
	${[...identifiers]
		.map(
			(id) =>
				`"${id
					.split("-")
					.map((item) => capitalize(item))
					.join("")}" = "${id}"`,
		)
		.join(",\n\t")}
};

export type CategoryValue = \`\${Category}\`;

export const isCategory = (category: string): category is CategoryValue => (Object.values(Category) as readonly string[]).includes(category);`,
);
