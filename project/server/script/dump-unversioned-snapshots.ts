import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";


const options = {
	"database": {
		type: "string",
	},
	"output-directory": {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options });

if (typeof values.database === "undefined") {
	console.error(
		"required parameter '--database' missing (location of database)",
	);
	process.exit(1);
}

let outputDirectory: string;
if (typeof values["output-directory"] === "undefined") {
  outputDirectory = await mkdtemp(join(tmpdir(), 'snapshot-'));
  console.warn(`output directory parameter '--output-directory' not specified, outputting to temporary directory <${outputDirectory}>`);
} else {
  await mkdir(values["output-directory"], { recursive: true });
  outputDirectory = values["output-directory"];
}

const db = new DatabaseSync(values.database, { readOnly: true });

const stmt = db.prepare("select id, data from snapshot where version = -1");
for (const row of stmt.iterate()) {
  await writeFile(
    join(outputDirectory, `${row["id"]}.json`),
    JSON.stringify(JSON.parse(row["data"] as string), null, 4),
    "utf8"
  );
}
