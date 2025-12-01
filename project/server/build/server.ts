import { readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import esbuild from "esbuild";

import { OUT_DIR } from "./base.ts";
import { formatNs } from "../src/utility/format.ts";

const BLUE = "\x1b[34m";
const END = "\x1b[0m";

(async () => {
  console.log(`[${BLUE}server${END}] building...`);

  const start = process.hrtime.bigint();

  const external = (await readdir("node_modules", { withFileTypes: true })).flatMap((ent) => {
    return (
      // externalize everything *except* packages that are symbolic links, because they aren't yet transpiled
      ent.isDirectory() ?[`./${ent.parentPath}/${ent.name}/*`]
        : []
    );
  });

  const result = await esbuild.build({
    entryPoints: [
      { out: "main", in: "src/entrypoint.ts" },
      { out: "worker-database", in: "src/service/database/worker.ts" },
      { out: "repl", in: "src/repl.ts" }
    ],
    platform: "node",
    format: "esm",
    bundle: true,
    sourcemap: "inline",
    metafile: true,
    external,
    outdir: join(resolve(OUT_DIR), "server"),
    outExtension: { ".js": ".mjs" },
  });

  await writeFile(join(resolve(OUT_DIR), "server", "meta.json"), JSON.stringify(result.metafile));

  console.log(`[${BLUE}server${END}] built in ${formatNs(process.hrtime.bigint() - start)}s`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
