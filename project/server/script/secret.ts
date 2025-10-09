import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { constants } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const SECRET_DIR = ".ephemeral/secret"

const supported = ["signing-key"] as const;
type Supported = typeof supported[number];
const isSupported = (kind: string): kind is Supported =>
  (supported as readonly string[]).includes(kind);

const options = {
	name: {
		type: "string",
	},
	kind: {
		type: "string",
	},
} as const;

const { values } = parseArgs({ options });

const { name, kind } = values;

if (typeof name === "undefined") {
	console.error(
		"required parameter '--name' missing (name of secret)",
	);
	process.exit(1);
}
if (typeof kind === "undefined") {
	console.error(
		"required parameter '--kind' missing (kind of secret)",
	);
	process.exit(1);
}

if (!isSupported(kind)) {
 	console.error(
    `unexpected value for parameter '--kind' (supported: ${supported.map(item => `"${item}"`).join(", ")})`,
	);
	process.exit(1);
}

await mkdir(SECRET_DIR, { recursive: true });

let secret: Buffer;
secret: {
  const path = join(SECRET_DIR, encodeURIComponent(name));
  try {
    secret = await readFile(path);
    break secret;
  } catch (e) {
    // "no such file or directory" is alright, others aren't
    if (!("errno" in e && e.errno === -constants.errno.ENOENT)) {
      throw e;
    }
  }

  switch (kind) {
    case "signing-key": {
      secret = randomBytes(64);
      break;
    }
  }

  await writeFile(path, secret, "binary");
}

process.stdout.write(secret.toString("hex"));
