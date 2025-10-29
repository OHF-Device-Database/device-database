import { parseArgs } from "node:util";
import { dirname, extname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { bundle, loadConfig } from "@redocly/openapi-core";
import { dumpBundle, sortTopLevelKeysForOas } from "@redocly/cli/lib/utils/miscellaneous.js";
import type { BundleResult } from "@redocly/openapi-core/lib/bundle";

const options = {
  spec: {
    type: "string",
  },
  out: {
    type: "string",
  },
} as const;

const { values } = parseArgs({ options });

if (typeof values.spec === "undefined") {
  console.error("required parameter '--spec' missing (location of OpenAPI specification)");
  process.exit(1);
}
if (typeof values.out === "undefined") {
  console.error("required parameter '--out' missing (destination for bundled specification)");
  process.exit(1);
}

const { spec, out } = values;

let bundled: BundleResult;
{
  const config = await loadConfig();
  bundled = await bundle({ ref: spec, config, dereference: false });
}

let serialized: string | undefined;
const extension = extname(values.out);
switch (extension) {
  case ".yaml":
  case ".yml": {
    serialized = dumpBundle(sortTopLevelKeysForOas(bundled.bundle.parsed), "yaml");
    break;
  }
  case ".json": {
    serialized = dumpBundle(sortTopLevelKeysForOas(bundled.bundle.parsed), "json");
  }
}

if (typeof serialized === "undefined") {
  console.error(
    `could not derive output format for unknown file extension <${extension}> for <${values.out}>`,
  );
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, serialized);
