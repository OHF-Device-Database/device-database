import { createReadStream } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { unroll } from "../../utility/iterable";
import { stream } from "./stream";

import type { SnapshotAttachableDevice, SnapshotAttachableEntity } from ".";

test("consumption", async (t: TestContext) => {
	const readStream = createReadStream(
		join(import.meta.dirname, "fixture", "1.json"),
	);

	const chained = stream(readStream);

	const malformedDevices: SnapshotAttachableDevice[] = [];
	const malformedEntities: SnapshotAttachableEntity[] = [];

	chained.on("malformed-device", ({ device }) => {
		malformedDevices.push(device);
	});

	chained.on("malformed-entity", ({ entity }) => {
		malformedEntities.push(entity);
	});

	t.assert.snapshot(await unroll(chained));
	t.assert.snapshot(malformedDevices);
	t.assert.snapshot(malformedEntities);
});
