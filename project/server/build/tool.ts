import { join, resolve } from "node:path";

import esbuild from "esbuild";

import { externalDependencies, OUT_DIR } from "./base.ts";

(async () => {
	const result = await esbuild.build({
		entryPoints: [
      { out: "migration-diff", in: "src/service/database/migrate/diff.ts" },
      { out: "migration-lint", in: "src/service/database/migrate/lint.ts" },
      { out: "migration-table-dml", in: "src/service/database/migrate/table-dml.ts" },
      { out: "database-query-debug", in: "src/service/database/query-debug.ts" },
      { out: "index-seed-github", in: "src/layer/index/seed/github.ts" },
      { out: "index-seed-dcl", in: "src/layer/index/seed/dcl.ts" },
      { out: "index-export", in: "src/layer/index/export/fs.ts" },
      // spawned by the database supervisor, resolved next to the tool
      { out: "worker-database", in: "src/service/database/worker.ts" }
		],
		platform: "node",
		format: "esm",
		bundle: true,
		sourcemap: "inline",
		metafile: true,
		external: externalDependencies(),
		outdir: join(resolve(OUT_DIR), "tool"),
		outExtension: { ".js": ".mjs" },
	});
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
