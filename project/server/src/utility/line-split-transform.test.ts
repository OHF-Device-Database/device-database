import { pipeline, Readable, Transform } from "node:stream";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { LineSplitTransform } from "./line-split-transform";

/** feeds `chunks` through the transform and collects every pushed line */
const split = async (
	chunks: readonly (string | Buffer)[],
): Promise<string[]> => {
	const transform = new LineSplitTransform();

	for (const chunk of chunks) {
		transform.write(
			typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk,
		);
	}
	transform.end();

	const lines: string[] = [];
	for await (const line of transform) {
		lines.push(line as string);
	}

	return lines;
};

/** slices `source` into `size` *byte* chunks, so boundaries can land mid-line and mid-code-point */
const chunked = (source: string, size: number): Buffer[] => {
	const buffer = Buffer.from(source, "utf8");

	const chunks: Buffer[] = [];
	for (let index = 0; index < buffer.byteLength; index += size) {
		chunks.push(buffer.subarray(index, index + size));
	}

	return chunks;
};

test("line split transform", async (t: TestContext) => {
	await t.test("empty input yields no lines", async (t: TestContext) => {
		t.assert.deepStrictEqual(await split([]), []);
		t.assert.deepStrictEqual(await split([""]), []);
	});

	await t.test("splits on newline", async (t: TestContext) => {
		t.assert.deepStrictEqual(await split(["a\nb\nc\n"]), ["a", "b", "c"]);
	});

	await t.test(
		"a trailing fragment without a terminator is still a line",
		async (t: TestContext) => {
			t.assert.deepStrictEqual(await split(["a\nb\nc"]), ["a", "b", "c"]);
		},
	);

	await t.test(
		"a trailing terminator yields no empty line",
		async (t: TestContext) => {
			t.assert.deepStrictEqual(await split(["a\n"]), ["a"]);
		},
	);

	await t.test(
		"strips the carriage return of a crlf",
		async (t: TestContext) => {
			t.assert.deepStrictEqual(await split(["a\r\nb\r\n"]), ["a", "b"]);
		},
	);

	await t.test(
		"a lone carriage return is not a terminator",
		async (t: TestContext) => {
			t.assert.deepStrictEqual(await split(["a\rb\n"]), ["a\rb"]);
		},
	);

	await t.test("preserves interior empty lines", async (t: TestContext) => {
		t.assert.deepStrictEqual(await split(["a\n\nb\n"]), ["a", "", "b"]);
	});

	await t.test("handles a crlf split across chunks", async (t: TestContext) => {
		t.assert.deepStrictEqual(await split(["a\r", "\nb\r", "\n"]), ["a", "b"]);
	});

	await t.test("is insensitive to chunk boundaries", async (t: TestContext) => {
		const source = "alpha\nbravo\r\ncharlie\n\ndelta";
		const expected = ["alpha", "bravo", "charlie", "", "delta"];

		for (const size of [1, 2, 3, 5, 7, 64]) {
			t.assert.deepStrictEqual(
				await split(chunked(source, size)),
				expected,
				`chunk size ${size}`,
			);
		}
	});

	await t.test(
		"handles a multi byte code point split across chunks",
		async (t: TestContext) => {
			// é and 你 and 😀 are 2, 3 and 4 bytes respectively
			const source = '{"a":"éè你好😀"}\n{"b":2}\n';
			const expected = ['{"a":"éè你好😀"}', '{"b":2}'];

			for (const size of [1, 2, 3, 5, 7]) {
				t.assert.deepStrictEqual(
					await split(chunked(source, size)),
					expected,
					`chunk size ${size}`,
				);
			}
		},
	);

	await t.test(
		"does not terminate on the separators readline splits on",
		async (t: TestContext) => {
			// `JSON.stringify` emits u+2028 and u+2029 unescaped, and `readline` treats both as line terminators
			const record = { name: "a\u2028b\u2029c" };
			const lines = await split([`${JSON.stringify(record)}\n`]);

			t.assert.strictEqual(lines.length, 1);
			t.assert.deepStrictEqual(JSON.parse(lines[0]), record);
		},
	);

	await t.test(
		"destroying the pipeline tail destroys the source",
		async (t: TestContext) => {
			let destroyed = false;

			const source = new Readable({
				read() {
					// never ends, so teardown can only come from a destroy
					this.push(Buffer.from("line\n", "utf8"));
				},
				destroy(error, callback) {
					destroyed = true;
					callback(error);
				},
			});

			const tail = pipeline(
				source,
				new LineSplitTransform(),
				new Transform({
					objectMode: true,
					transform(chunk, _, callback) {
						this.push(chunk);
						callback();
					},
				}),
				() => {},
			);

			let seen = 0;
			for await (const line of tail) {
				t.assert.strictEqual(line, "line");

				seen += 1;
				if (seen === 4) {
					// `break` invokes the iterator's `return()`, which destroys `tail`
					break;
				}
			}

			await delay(10);

			t.assert.strictEqual(seen, 4);
			t.assert.strictEqual(destroyed, true, "source was not destroyed");
			t.assert.strictEqual(source.destroyed, true);
		},
	);
});
