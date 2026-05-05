import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { floor } from "../../type/codec/integer";
import { unroll } from "../../utility/iterable";
import { omit } from "../../utility/omit";
import {
	SnapshotRequestTransform,
	type SnapshotRequestTransformDevice,
	type SnapshotRequestTransformEntity,
	type SnapshotRequestTransformMalformedDevice,
	type SnapshotRequestTransformMalformedEntity,
	type SnapshotRequestTransformMalformedLink,
	type SnapshotRequestTransformOut,
	stream,
} from "./stream";

import type {
	SnapshotAttachableDevice,
	SnapshotAttachableEntity,
	SnapshotHash,
} from ".";

const templateEntity = (
	overrides: Partial<SnapshotAttachableEntity> = {},
): SnapshotAttachableEntity => {
	return {
		assumed_state: null,
		domain: "sensor",
		entity_category: null,
		has_entity_name: false,
		original_device_class: null,
		unit_of_measurement: null,
		...overrides,
	};
};

const templateDevice = (
	overrides: Partial<SnapshotAttachableDevice> & {
		entities?: SnapshotAttachableEntity[];
	} = {},
): SnapshotAttachableDevice & { entities: SnapshotAttachableEntity[] } => {
	const { entities = [], ...rest } = overrides;
	return {
		entry_type: null,
		has_configuration_url: false,
		hw_version: null,
		manufacturer: "Manufacturer",
		model_id: null,
		model: "Model",
		sw_version: null,
		via_device: null,
		entities,
		...rest,
	};
};

await test("consumption", async (t: TestContext) => {
	const fixturePath = join(import.meta.dirname, "fixture", "1.json");

	const readStream = createReadStream(fixturePath);

	const chained = stream(readStream);

	const malformedDevices: unknown[] = [];
	const malformedEntities: unknown[] = [];
	const malformedLinks: SnapshotRequestTransformMalformedLink[] = [];

	chained.on("malformed-device", ({ device }) => {
		malformedDevices.push(device);
	});

	chained.on("malformed-entity", ({ entity }) => {
		malformedEntities.push(entity);
	});

	chained.on("malformed-link", (link) => {
		malformedLinks.push(link);
	});

	let size;
	chained.once("size", (s) => {
		size = s;
	});

	t.assert.snapshot(await unroll(chained));

	t.assert.snapshot(malformedDevices);
	t.assert.snapshot(malformedEntities);
	t.assert.deepStrictEqual(malformedLinks, []);

	t.assert.deepStrictEqual(size, (await stat(fixturePath)).size);

	const hash = chained.hash();
	t.assert.deepStrictEqual(hash.version, 1);
	t.assert.deepStrictEqual(
		hash.hash.toString("hex"),
		"74ad78186ef5337d2997c244790a8d9bf12f3d3630ac0aa722750603daaca2d2",
	);
});

const collect = async (
	parts: [
		integration: string,
		{ key: "devices" | "entities"; value: unknown[] },
	][],
): Promise<{
	devices: SnapshotRequestTransformDevice[];
	entities: SnapshotRequestTransformEntity[];
	malformedDevices: SnapshotRequestTransformMalformedDevice[];
	malformedEntities: SnapshotRequestTransformMalformedEntity[];
	malformedLinks: SnapshotRequestTransformMalformedLink[];
	output: SnapshotRequestTransformOut[];
	hash: SnapshotHash;
}> => {
	return new Promise((resolve, reject) => {
		const transform = new SnapshotRequestTransform();

		const devices: SnapshotRequestTransformDevice[] = [];
		const entities: SnapshotRequestTransformEntity[] = [];
		const malformedDevices: SnapshotRequestTransformMalformedDevice[] = [];
		const malformedEntities: SnapshotRequestTransformMalformedEntity[] = [];
		const malformedLinks: SnapshotRequestTransformMalformedLink[] = [];

		const output: SnapshotRequestTransformOut[] = [];

		transform.on("device", (item) => devices.push(item));
		transform.on("entity", (item) => entities.push(item));
		transform.on("malformed-device", (item) => malformedDevices.push(item));
		transform.on("malformed-entity", (item) => malformedEntities.push(item));
		transform.on("malformed-link", (item) => malformedLinks.push(item));
		transform.on("data", (item) => output.push(item));

		transform.once("end", () => {
			resolve({
				devices,
				entities,
				malformedDevices,
				malformedEntities,
				malformedLinks,
				output,
				hash: transform.hash(),
			});
		});
		transform.once("error", reject);

		for (const part of parts) {
			transform.write(part);
		}

		transform.end();
	});
};

await test("emits", async (t: TestContext) => {
	t.test("device emits device event", async (t: TestContext) => {
		const device = templateDevice();

		const result = await collect([
			[
				"a",
				{
					key: "devices",
					value: [device],
				},
			],
		]);

		t.assert.deepStrictEqual(result.devices, [
			{
				integration: "a",
				device: omit(device, "entities"),
				entities: device.entities,
				hash: Buffer.from(
					"585f08900fbdcd5e9362b2768535174101652a8bddc25cbddbf3ab03accb5d90",
					"hex",
				),
			},
		]);
		t.assert.deepStrictEqual(
			result.output.flatMap((item) => ("device" in item ? [item] : [])),
			[
				{
					integration: "a",
					device: omit(device, "entities"),
					entities: device.entities,
				},
			],
			"device must still be emitted as data as well",
		);
	});

	t.test("entity emits entity event", async (t: TestContext) => {
		const entity = templateEntity();

		const result = await collect([
			[
				"a",
				{
					key: "entities",
					value: [entity],
				},
			],
		]);

		t.assert.deepStrictEqual(result.entities, [
			{
				integration: "a",
				entity,
			},
		]);
		t.assert.deepStrictEqual(
			result.output.flatMap((item) => ("entity" in item ? [item] : [])),
			[
				{
					integration: "a",
					entity,
				},
			],
			"entity must still be emitted as data as well",
		);
	});

	t.test(
		"malformed device emits malformed device event",
		async (t: TestContext) => {
			const valid = templateDevice({ model: "valid" });
			const invalid = { model: 1 };

			const result = await collect([
				[
					"a",
					{
						key: "devices",
						value: [valid, invalid],
					},
				],
			]);

			t.assert.strictEqual(result.malformedDevices.length, 1);
			const picked = result.malformedDevices[0];
			t.assert.deepStrictEqual(omit(picked, "error"), {
				integration: "a",
				device: invalid,
			});

			t.assert.deepStrictEqual(
				result.output.flatMap((item) => ("device" in item ? [item] : [])),
				[
					{
						integration: "a",
						device: omit(valid, "entities"),
						entities: valid.entities,
					},
				],
				"valid device must still be pushed downstream",
			);
		},
	);

	t.test(
		"malformed entity emits malformed entity event",
		async (t: TestContext) => {
			const valid = templateEntity({ domain: "sensor" });
			const invalid = { domain: 1 };

			const result = await collect([
				[
					"a",
					{
						key: "entities",
						value: [valid, invalid],
					},
				],
			]);

			t.assert.strictEqual(result.malformedEntities.length, 1);
			const picked = result.malformedEntities[0];
			t.assert.deepStrictEqual(omit(picked, "error"), {
				integration: "a",
				entity: invalid,
			});

			t.assert.deepStrictEqual(
				result.output.flatMap((item) => ("entity" in item ? [item] : [])),
				[{ integration: "a", entity: valid }],
				"valid entity must still be pushed downstream",
			);
		},
	);

	t.test("dangling link emits malformed link event", async (t: TestContext) => {
		const device = templateDevice({
			model: "valid",
			via_device: ["foo", floor(1)],
		});

		const result = await collect([
			[
				"a",
				{
					key: "devices",
					value: [device],
				},
			],
		]);

		t.assert.deepStrictEqual(
			result.malformedLinks,
			[{ kind: "dangling", integration: "foo", offset: 1 }],
			"exactly one event must be emitted",
		);

		t.assert.deepStrictEqual(
			result.output.flatMap((item) => ("device" in item ? [item] : [])),
			[
				{
					integration: "a",
					device: omit(device, "entities"),
					entities: device.entities,
				},
			],
			"device must still be pushed downstream",
		);
	});

	t.test("circular link emits malformed link event", async (t: TestContext) => {
		const device = templateDevice({
			model: "valid",
			via_device: ["a", floor(0)],
		});

		const result = await collect([
			[
				"a",
				{
					key: "devices",
					value: [device],
				},
			],
		]);

		t.assert.deepStrictEqual(
			result.malformedLinks,
			[{ kind: "circular", integration: "a", offset: 0 }],
			"exactly one event must be emitted",
		);

		t.assert.deepStrictEqual(
			result.output.flatMap((item) => ("device" in item ? [item] : [])),
			[
				{
					integration: "a",
					device: omit(device, "entities"),
					entities: device.entities,
				},
			],
			"device must still be pushed downstream",
		);
	});
});

const hash = async (
	parts: [
		integration: string,
		{ key: "devices" | "entities"; value: unknown[] },
	][],
): Promise<SnapshotHash> => {
	return new Promise((resolve, reject) => {
		const transform = new SnapshotRequestTransform();

		transform.once("end", () => resolve(transform.hash()));
		transform.once("error", reject);

		// consume the output so `_final` is called
		transform.resume();

		for (const part of parts) {
			transform.write(part);
		}

		transform.end();
	});
};

await test("hashing", async (t: TestContext) => {
	t.test(
		"entity order does not affect the device hash",
		async (t: TestContext) => {
			const e1 = templateEntity({
				domain: "sensor",
				entity_category: "diagnostic",
			});
			const e2 = templateEntity({
				domain: "binary_sensor",
				unit_of_measurement: "%",
			});

			t.assert.deepStrictEqual(
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [templateDevice({ entities: [e1, e2] })],
						},
					],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [templateDevice({ entities: [e2, e1] })],
						},
					],
				]),
				"entity order within a device must not affect the hash",
			);
		},
	);

	t.test(
		"duplicate devices across integrations yield the same overall hash regardless of order",
		async (t: TestContext) => {
			const d = templateDevice();

			t.assert.deepStrictEqual(
				await hash([
					["x", { key: "devices", value: [d] }],
					["y", { key: "devices", value: [d] }],
				]),
				await hash([
					["y", { key: "devices", value: [d] }],
					["x", { key: "devices", value: [d] }],
				]),
				"swapping integration order must not change the hash",
			);
		},
	);

	t.test(
		"duplicate devices within the same integration are deduplicated",
		async (t: TestContext) => {
			const d = templateDevice();

			t.assert.deepStrictEqual(
				await hash([["x", { key: "devices", value: [d] }]]),
				await hash([["x", { key: "devices", value: [d, d] }]]),
				"duplicate identical devices in one integration should hash identically to a single occurrence",
			);
		},
	);

	t.test(
		"order of distinct devices does not affect the overall hash",
		async (t: TestContext) => {
			const d1 = templateDevice({
				model: "model 1",
			});
			const d2 = templateDevice({
				model: "model 2",
			});

			t.assert.deepStrictEqual(
				await hash([["a", { key: "devices", value: [d1, d2] }]]),
				await hash([["a", { key: "devices", value: [d2, d1] }]]),
				"device order within an integration must not affect the hash",
			);
		},
	);

	t.test(
		"integration entities do not affect the hash",
		async (t: TestContext) => {
			const d = templateDevice();

			t.assert.deepStrictEqual(
				await hash([["a", { key: "devices", value: [d] }]]),
				await hash([
					["a", { key: "devices", value: [d] }],
					[
						"a",
						{
							key: "entities",
							value: [
								templateEntity({ domain: "sensor" }),
								templateEntity({
									domain: "binary_sensor",
									unit_of_measurement: "%",
								}),
							],
						},
					],
				]),
				"presence of integration entities must not change the hash",
			);
		},
	);

	t.test(
		"identical devices whose device links differ produce different hashes",
		async (t: TestContext) => {
			t.assert.notDeepStrictEqual(
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								templateDevice({ model: "1" }),
								templateDevice({
									via_device: ["a", floor(0)],
								}),
							],
						},
					],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								templateDevice({ model: "2" }),
								templateDevice({
									via_device: ["a", floor(0)],
								}),
							],
						},
					],
				]),
				"different device link targets must yield different hashes even when child fields are identical",
			);
		},
	);

	t.test(
		"identical devices with the same device link produce the same hash regardless of order",
		async (t: TestContext) => {
			const parent = templateDevice({ manufacturer: "foo" });

			t.assert.deepStrictEqual(
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								parent,
								templateDevice({
									manufacturer: "bar",
									via_device: ["a", floor(0)],
								}),
							],
						},
					],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								templateDevice({
									manufacturer: "bar",
									via_device: ["a", floor(1)],
								}),
								parent,
							],
						},
					],
				]),
				"valid link hash must be deterministic",
			);
		},
	);

	t.test(
		"malformed device link yields the same hash as an equivalent submission with no link",
		async (t: TestContext) => {
			const parent = templateDevice({ manufacturer: "foo" });

			t.assert.deepStrictEqual(
				await hash([
					["a", { key: "devices", value: [templateDevice(), parent] }],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								templateDevice({
									via_device: ["a", floor(0)],
								}),
								parent,
							],
						},
					],
				]),
				"malformed link should produce the same hash as an equivalent submission with no link",
			);
		},
	);

	t.test("empty input produces a stable hash", async (t: TestContext) => {
		t.assert.deepStrictEqual(
			await hash([]),
			await hash([]),
			"empty input must yield the same hash on repeated calls",
		);
	});

	t.test(
		"single device and no devices produce different hashes",
		async (t: TestContext) => {
			t.assert.notDeepStrictEqual(
				await hash([["a", { key: "devices", value: [templateDevice()] }]]),
				await hash([]),
				"submission with a device must differ from an empty submission",
			);
		},
	);

	t.test(
		"cross-integration device link is reflected in hash",
		async (t: TestContext) => {
			const parent = templateDevice();

			t.assert.notDeepStrictEqual(
				await hash([
					["a", { key: "devices", value: [parent] }],
					[
						"b",
						{
							key: "devices",
							value: [
								templateDevice({
									manufacturer: "foo",
									via_device: ["a", floor(0)],
								}),
							],
						},
					],
				]),
				await hash([
					["a", { key: "devices", value: [parent] }],
					[
						"b",
						{
							key: "devices",
							value: [templateDevice({ manufacturer: "foo" })],
						},
					],
				]),
				"valid cross-integration link must change the hash",
			);
		},
	);

	t.test(
		"duplicate parent links from the same child are deduplicated in the hash",
		async (t: TestContext) => {
			const parent = templateDevice();
			const child = templateDevice({
				manufacturer: "foo",
				via_device: ["a", floor(0)],
			});

			t.assert.deepStrictEqual(
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [parent, child, child],
						},
					],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [parent, child],
						},
					],
				]),
				"duplicate identical child→parent links must be deduplicated",
			);
		},
	);

	t.test(
		"device present in two integrations yields a different hash than the same device in one integration",
		async (t: TestContext) => {
			const d = templateDevice();

			t.assert.notDeepStrictEqual(
				await hash([
					["a", { key: "devices", value: [d] }],
					["b", { key: "devices", value: [d] }],
				]),
				await hash([["a", { key: "devices", value: [d] }]]),
				"the same device under two integrations must differ from one integration",
			);
		},
	);

	t.test(
		"two identical devices where only one has a device link differ from neither having a link",
		async (t: TestContext) => {
			const parent = templateDevice();

			t.assert.notDeepStrictEqual(
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								parent,
								templateDevice({
									model: "b",
									via_device: ["a", floor(0)],
								}),
							],
						},
					],
				]),
				await hash([
					[
						"a",
						{
							key: "devices",
							value: [
								parent,
								templateDevice({
									model: "a",
								}),
							],
						},
					],
				]),
				"presence of a via_device link on an otherwise identical device must change the hash",
			);
		},
	);
});
