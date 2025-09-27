import { join, resolve } from "node:path";

import esbuild from "esbuild";

import { OUT_DIR } from "./base.ts";

(async () => {
	const result = await esbuild.build({
		entryPoints: [
			{ out: "migration-diff", in: "src/service/database/diff.ts" },
			{ out: "snapshot-schema-validate", in: "src/service/snapshot/validate.ts" },
			{ out: "snapshot-json-schema", in: "src/service/snapshot/json-schema.ts" },
		],
		platform: "node",
		format: "esm",
		bundle: true,
		sourcemap: "inline",
		metafile: true,
		external: ["./node_modules/*"],
		outdir: join(resolve(OUT_DIR), "tool"),
		outExtension: { ".js": ".mjs" },
	});
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
