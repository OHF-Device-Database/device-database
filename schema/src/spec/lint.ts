import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { bundle, loadConfig } from "@redocly/openapi-core";
import { dumpBundle, sortTopLevelKeysForOas } from "@redocly/cli/lib/utils/miscellaneous.js";
import { parseDocument, visit, isMap, isScalar, isSeq } from "yaml";

import type { BundleResult } from "@redocly/openapi-core/lib/bundle";

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

function error(path: string[], error: string) {
  console.error(`[!] <[${path.join(", ")}]> ${error}`);
  process.exitCode = 1;
}

// bundled spec still contains references → dereference
let bundled: BundleResult;
{
  const config = await loadConfig();
  bundled = await bundle({ ref: values.bundle, config, dereference: true });
}

const dereferenced = dumpBundle(sortTopLevelKeysForOas(bundled.bundle.parsed), "yaml");

const document = parseDocument(dereferenced);
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
          error(["paths", String(key0.value), String(key1.value)], "value should be a map");
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
              ["paths", String(key0.value), String(key1.value), `parameters:${idx}`],
              "found non-map key of parameter",
            );
            continue;
          }

          const in_ = node.get("in", true);
          const schema = node.get("schema", true);

          if (!isScalar(in_)) {
            error(
              ["paths", String(key0.value), String(key1.value), `parameters:${idx}`, "in"],
              `should be a scalar`,
            );
            continue;
          }

          const allowedParameterIns = ["header", "query", "path"];
          if (!(allowedParameterIns as unknown[]).includes(in_.value)) {
            error(
              ["paths", String(key0.value), String(key1.value), `parameters:${idx}`, "in"],
              `should be on of [${allowedParameterIns.map((item) => `"${item}"`).join(", ")}]`,
            );
          }

          if (!isMap(schema)) {
            error(
              ["paths", String(key0.value), String(key1.value), `parameters:${idx}`, "schema"],
              `should be a map`,
            );
            return;
          }

          const type_ = schema.get("type", true);
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
        }
      },
    });
  },
});
