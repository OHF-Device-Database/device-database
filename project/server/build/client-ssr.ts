import { join, resolve } from "node:path";

import esbuild from "esbuild";

// this only works if `client` is installed via symlink
// https://docs.npmjs.com/cli/v8/commands/npm-link#caveat
import { buildOptions } from "client/build.config.ts";
import { OUT_DIR } from "./base.ts";
import { formatNs } from "../src/utility/format.ts";

(async () => {
  console.log("[\x1b[36mclient-ssr\x1b[0m] building...");

  const start = process.hrtime.bigint();

  await esbuild.build({
    ...buildOptions,
    entryPoints: ["src/entrypoint.ts"],
    outExtension: { ".js": ".mjs" },
    platform: "node",
    splitting: false,
    minify: false,
    publicPath: "/static",
    sourcemap: "inline",
    outdir: join(resolve(OUT_DIR), "client-ssr"),
    define: {
      API_BASE_URL: '""',
      SSR: "true"
    },
    // lit expects `TextEncoder` and `TextDecoder` to be defined globally, which they aren't in node.js
    banner: { js: 'const { TextEncoder, TextDecoder } = await import("util")' }
  });

  const end = process.hrtime.bigint();

  console.log(
    `[\x1b[36mclient-ssr\x1b[0m] built in ${formatNs(end-start)}s`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
