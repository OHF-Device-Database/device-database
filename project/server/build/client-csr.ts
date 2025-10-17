import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import esbuild from "esbuild";

// this only works if `client` is installed via symlink
// https://docs.npmjs.com/cli/v8/commands/npm-link#caveat
import { buildOptions } from "client/build.config.ts";
import { OUT_DIR } from "./base.ts";
import { formatNs } from "../src/utility/format.ts";

(async () => {
  console.log("[\x1b[36mclient-csr\x1b[0m] building...");
  let start = process.hrtime.bigint();

  const result = await esbuild.build({
    ...buildOptions,
    minify: true,
    minifySyntax: true,
    sourcemap: false,
    metafile: true,
    publicPath: "/static",
    outdir: join(resolve(OUT_DIR), "client-csr"),
    define: {
      API_BASE_URL: '""',
      SSR: "false",
    }
  });

  await writeFile(
    join(resolve(OUT_DIR), "client-csr", "meta.json"),
    JSON.stringify(result.metafile),
  );

  const end = process.hrtime.bigint();

  console.log(
    `[\x1b[36mclient-csr\x1b[0m] built in ${formatNs(end - start)}s`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
