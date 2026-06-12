import { parseArgs } from "node:util";

import {
	dumpBundle,
	sortTopLevelKeysForOas,
} from "@redocly/cli/lib/utils/miscellaneous.js";
import { bundle, loadConfig } from "@redocly/openapi-core";
import type { BundleResult } from "@redocly/openapi-core/lib/bundle.js";
import {
	type Document,
	isMap,
	isScalar,
	isSeq,
	parseDocument,
	visit,
} from "yaml";

const options = {
	bundle: {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options });

if (typeof values.bundle === "undefined") {
	console.error(
		"required parameter '--bundle' missing (location of bundled OpenAPI specification)",
	);
	process.exit(1);
}

const error = (path: string[], error: string) => {
	console.error(`[!] <[${path.join(", ")}]> ${error}`);
	process.exitCode = 1;
};

// bundled spec still contains references → dereference
let bundled: BundleResult;
{
	const config = await loadConfig();
	bundled = await bundle({ ref: values.bundle, config, dereference: false });
}

const dumped = dumpBundle(
	sortTopLevelKeysForOas(bundled.bundle.parsed),
	"yaml",
);

const document = parseDocument(dumped);

/**
 * resolves $ref pointers to a specified depth
 * returns dereferenced node, or original node if it is not a reference
 */
const shallowDereference = (
	doc: Document,
	node: unknown,
	depth: number,
): unknown => {
	if (depth <= 0 || !isMap(node)) {
		return node;
	}
	const ref = node.get("$ref");
	if (typeof ref !== "string" || !ref.startsWith("#/")) {
		return node;
	}
	const parts = ref
		.slice(2)
		.split("/")
		.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));

	let resolved: unknown = doc.contents;
	for (const part of parts) {
		if (!isMap(resolved)) return node;
		resolved = resolved.get(part, true);
	}

	return shallowDereference(doc, resolved, depth - 1);
};

const paths = document.get("paths");

if (!isMap(paths)) {
	error(["paths"], "should be a map");
	process.exit();
}

// constrain parameter types to be strings
visit(paths, {
	Pair(_, pair, path0) {
		if (path0.length > 2) {
			return visit.SKIP;
		}

		const { key: key0, value: value0 } = pair;

		if (!isScalar(key0)) {
			error(["paths"], "found non-scalar key of paths");
			return;
		}

		if (typeof key0.value !== "string") {
			error(["paths", String(key0.value)], "key should be a string");
			return;
		}

		if (!isMap(value0)) {
			error(["paths", String(key0.value)], "value should be a map");
			return;
		}

		visit(value0, {
			Pair(_, pair, path1) {
				if (path1.length > 2) {
					return visit.SKIP;
				}

				const { key: key1, value: value1 } = pair;

				if (!isScalar(key1)) {
					error(["paths", String(key0.value)], "found non-scalar key of path");
					return;
				}

				const allowedMethods = ["get", "put", "patch", "post", "delete"];
				if (!(allowedMethods as unknown[]).includes(key1.value)) {
					error(
						["paths", String(key0.value), String(key1.value)],
						`key should be on of [${allowedMethods.map((item) => `"${item}"`).join(", ")}]`,
					);
				}

				if (!isMap(value1)) {
					error(
						["paths", String(key0.value), String(key1.value)],
						"value should be a map",
					);
					return;
				}

				const parameters = value1.get("parameters");
				if (typeof parameters === "undefined") {
					return;
				}

				if (!isSeq(parameters)) {
					error(
						["paths", String(key0.value), String(key1.value), "parameters"],
						"value should be a sequence",
					);
					return;
				}

				for (const [idx, node] of parameters.items.entries()) {
					if (!isMap(node)) {
						error(
							[
								"paths",
								String(key0.value),
								String(key1.value),
								`parameters:${idx}`,
							],
							"found non-map key of parameter",
						);
						continue;
					}

					const in_ = node.get("in", true);
					const schema = node.get("schema", true);

					if (!isScalar(in_)) {
						error(
							[
								"paths",
								String(key0.value),
								String(key1.value),
								`parameters:${idx}`,
								"in",
							],
							`should be a scalar`,
						);
						continue;
					}

					const allowedParameterIns = ["header", "query", "path"];
					if (!(allowedParameterIns as unknown[]).includes(in_.value)) {
						error(
							[
								"paths",
								String(key0.value),
								String(key1.value),
								`parameters:${idx}`,
								"in",
							],
							`should be on of [${allowedParameterIns.map((item) => `"${item}"`).join(", ")}]`,
						);
					}

					const resolvedSchema = shallowDereference(document, schema, 1);
					if (!isMap(resolvedSchema)) {
						error(
							[
								"paths",
								String(key0.value),
								String(key1.value),
								`parameters:${idx}`,
								"schema",
							],
							`should be a map`,
						);
						return;
					}

					const type_ = resolvedSchema.get("type", true);
					if (!isScalar(type_)) {
						error(
							[
								"paths",
								String(key0.value),
								String(key1.value),
								`parameters:${idx}`,
								"schema",
								"type",
							],
							`should be a scalar`,
						);
						return;
					}

					switch (in_.value) {
						case "query": {
							// also allow string array for query parameters
							if (type_.value === "array") {
								const items_ = shallowDereference(
									document,
									resolvedSchema.get("items"),
									1,
								);
								if (!isMap(items_)) {
									error(
										[
											"paths",
											String(key0.value),
											String(key1.value),
											`parameters:${idx}`,
											"schema",
											"items",
										],
										`should be map`,
									);
									break;
								}

								if (items_.get("type") !== "string") {
									error(
										[
											"paths",
											String(key0.value),
											String(key1.value),
											`parameters:${idx}`,
											"schema",
											"items",
											"type",
										],
										`should be string`,
									);
									break;
								}
							} else if (type_.value !== "string") {
								error(
									[
										"paths",
										String(key0.value),
										String(key1.value),
										`parameters:${idx}`,
										"schema",
										"type",
									],
									`type should be string or string array`,
								);
							}
							break;
						}
						default: {
							if (type_.value !== "string") {
								error(
									[
										"paths",
										String(key0.value),
										String(key1.value),
										`parameters:${idx}`,
										"schema",
										"type",
									],
									`only string is supported as type`,
								);
							}
							break;
						}
					}
				}
			},
		});
	},
});
