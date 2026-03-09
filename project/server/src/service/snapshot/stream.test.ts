import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { unroll } from "../../utility/iterable";
import { stream } from "./stream";

import type { SnapshotAttachableDevice, SnapshotAttachableEntity } from ".";

test("consumption", async (t: TestContext) => {
	const fixturePath = join(import.meta.dirname, "fixture", "1.json");

	const readStream = createReadStream(fixturePath);

	const chained = stream(readStream);

	const malformedDevices: SnapshotAttachableDevice[] = [];
	const malformedEntities: SnapshotAttachableEntity[] = [];

	chained.on("malformed-device", ({ device }) => {
		malformedDevices.push(device);
	});

	chained.on("malformed-entity", ({ entity }) => {
		malformedEntities.push(entity);
	});

	let size;
	chained.once("size", (s) => {
		size = s;
	});

	t.assert.snapshot(await unroll(chained));
	t.assert.snapshot(malformedDevices);
	t.assert.snapshot(malformedEntities);
	t.assert.deepStrictEqual(size, (await stat(fixturePath)).size);
});
