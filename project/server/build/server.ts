import { glob, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { cpSync } from "node:fs";

import esbuild from "esbuild";
import type { Plugin } from "esbuild";

import { OUT_DIR } from "./base.ts";
import { formatNs } from "../src/utility/format.ts";

const BLUE = "\x1b[34m";
const END = "\x1b[0m";

export const copyStaticPlugin = (
  source: string,
  relate: string,
  destination: string,
): Plugin => ({
  name: "copy-static",
  setup(build) {
    build.onEnd(async () => {
      for await (const ent of glob(source)) {
        const to = relative(relate, ent);
        cpSync(ent, join(build.initialOptions.outdir!, destination, to), { recursive: true, dereference: true });
      }
    });
  },
});

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
    ],
    platform: "node",
    format: "esm",
    bundle: true,
    sourcemap: "inline",
    metafile: true,
    external,
    outdir: join(resolve(OUT_DIR), "server"),
    outExtension: { ".js": ".mjs" },
    plugins: [copyStaticPlugin("src/portal/**/static/*", "src/portal", "portal")]
  });

  await writeFile(`${OUT_DIR}/meta.json`, JSON.stringify(result.metafile));

  console.log(`[${BLUE}server${END}] built in ${formatNs(process.hrtime.bigint() - start)}s`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
