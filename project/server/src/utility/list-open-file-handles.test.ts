import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { type TestContext, test } from "node:test";

import { unroll } from "./iterable";
import { lsof } from "./list-open-file-handles";

test("list open file handles", async (t: TestContext) => {
	const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-lsof-"),
	);

	const file = join(directory, "file.txt");
	await writeFile(file, "foo");

	const tail1 = spawn("tail", ["-f", file]);
	const tail2 = spawn("tail", ["-f", file]);

	try {
		t.assert.ok(typeof tail1.pid !== "undefined");
		t.assert.ok(typeof tail2.pid !== "undefined");

		const sorted = (await unroll(lsof(file))).sort();

		t.assert.deepStrictEqual(sorted, [tail1.pid, tail2.pid].sort());
	} finally {
		tail1.kill();
		tail2.kill();

		await rm(directory, { recursive: true, force: true });
	}
});
