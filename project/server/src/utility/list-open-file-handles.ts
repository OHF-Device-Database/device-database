import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

export async function* lsof(path: string): AsyncIterable<number> {
	const spawned = spawn("lsof", [
		// terse mode yields one pid per line
		"-t",
		path,
	]);

	const rl = createInterface({
		input: spawned.stdout,
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		const parsed = Number.parseInt(line, 10);
		if (Number.isNaN(parsed)) {
			continue;
		}

		yield parsed;
	}
}
