import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { subDays } from "date-fns/subDays";

import { floor } from "../../type/codec/integer";
import { uuid } from "../../type/codec/uuid";
import { isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import { testDatabase } from "../database/utility";
import { Snapshot, type SnapshotHandle } from "../snapshot";
import { Voucher } from "../voucher";

const light1 = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Signify Netherlands B.V.",
	model: "Hue white lamp",
	model_id: "LWB010",
	sw_version: "1.116.3",
	via_device: null,
} as const;

const light2 = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Signify Netherlands B.V.",
	model: null,
	model_id: "LWB010",
	sw_version: "1.116.3",
	via_device: null,
} as const;

const hub1 = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Signify Netherlands B.V.",
	model: "Hue Bridge",
	model_id: "BSB002",
	sw_version: "1.73.1973038060",
	via_device: null,
} as const;

const entity1 = {
	assumed_state: false,
	domain: "light",
	entity_category: null,
	has_entity_name: true,
	original_device_class: null,
	unit_of_measurement: null,
} as const;

test("snapshot voucher creation", async (t: TestContext) => {
	await using database = await testDatabase(true);

	const snapshot = new Snapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	{
		const voucher = snapshot.voucher.create(new Date());
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");
	}

	{
		const subject = uuid();
		const voucher = snapshot.voucher.create(subDays(new Date(), 1), subject);
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");

		const peeked = Voucher.peek(deserialized.voucher);
		t.assert.partialDeepStrictEqual(peeked, {
			sub: subject,
		});
	}

	{
		const voucher = snapshot.voucher.create(subDays(new Date(), 1));
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(
			`foo${serialized.slice(3)}`,
		);
		t.assert.partialDeepStrictEqual(deserialized, {
			kind: "error",
			cause: "malformed",
		});
	}
});

test("snapshot creation", async (t: TestContext) => {
	await using database = await testDatabase(false);

	const snapshot = new Snapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const now = new Date(Math.floor(Date.now() / 1000) * 1000);
	t.mock.timers.enable({ apis: ["Date"], now });

	{
		const subject = uuid();
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		t.assert.partialDeepStrictEqual(
			await unroll(snapshot.staging.submissions({ subject })),
			[
				{
					subject,
					hassVersion: "2025.11.0",
					createdAt: now,
					completedAt: undefined,
				},
			],
		);

		await snapshot.finalize(handle);

		t.assert.partialDeepStrictEqual(
			await unroll(snapshot.staging.submissions({ subject })),
			[
				{
					subject,
					hassVersion: "2025.11.0",
					createdAt: now,
					completedAt: now,
				},
			],
		);
	}

	{
		const subject = uuid();
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
					complete: true,
				}),
			),
			[],
		);
		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
					complete: false,
				}),
			),
			[
				{
					subject,
					createdAt: now,
					hassVersion: "2025.11.0",
					completedAt: undefined,
				},
			],
		);
		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
				}),
			),
			[
				{
					subject,
					createdAt: now,
					hassVersion: "2025.11.0",
					completedAt: undefined,
				},
			],
		);

		await snapshot.finalize(handle);

		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
					complete: true,
				}),
			),
			[
				{
					subject,
					createdAt: now,
					hassVersion: "2025.11.0",
					completedAt: now,
				},
			],
		);
		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
					complete: false,
				}),
			),
			[],
		);
		t.assert.partialDeepStrictEqual(
			await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: now,
				}),
			),
			[
				{
					subject,
					createdAt: now,
					hassVersion: "2025.11.0",
					completedAt: now,
				},
			],
		);
	}

	t.mock.timers.reset();
});

test("snapshot ordering", async (t: TestContext) => {
	const subject = uuid();

	// by subject
	{
		await using database = await testDatabase(false);

		const snapshot = new Snapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		t.mock.timers.enable({ apis: ["Date"] });
		{
			const voucher = snapshot.voucher.create(new Date(), subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));
			await snapshot.finalize(handle);
		}

		t.mock.timers.tick(2000);

		{
			const voucher = snapshot.voucher.create(new Date(), subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));
			await snapshot.finalize(handle);
		}

		const submissions = await unroll(snapshot.staging.submissions({ subject }));
		t.assert.deepStrictEqual(submissions.length, 2);
		t.assert.ok(submissions[0].createdAt > submissions[1].createdAt);

		t.mock.timers.reset();
	}

	// by created between
	{
		await using database = await testDatabase(false);

		const snapshot = new Snapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		t.mock.timers.enable({ apis: ["Date"] });
		{
			const voucher = snapshot.voucher.create(new Date(), subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));
			await snapshot.finalize(handle);
		}

		t.mock.timers.tick(2000);

		{
			const voucher = snapshot.voucher.create(new Date(), subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));
			await snapshot.finalize(handle);
		}

		const submissions = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
		t.assert.deepStrictEqual(submissions.length, 2);
		t.assert.ok(submissions[0].createdAt > submissions[1].createdAt);

		t.mock.timers.reset();
	}
});

test("snapshot deduplication", async (t: TestContext) => {
	await using database = await testDatabase(false);

	const snapshot = new Snapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	const attach = async (handle: SnapshotHandle) => {
		await snapshot.attach.device(
			handle,
			"hue",
			{ ...light1, via_device: ["hue", floor(1)] },
			[entity1],
		);
		await snapshot.attach.device(handle, "hue", light2, []);
		await snapshot.attach.entity(handle, "hue", entity1);
	};

	t.mock.timers.enable({ apis: ["Date"] });

	let devices;
	let devicePermutations;
	let devicePermutationLinks;
	let devicePermutationEntities;
	let integrationEntities;
	{
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(handle);

		let submissionId;
		{
			const submissions = await unroll(
				snapshot.staging.submissions({ subject }),
			);
			submissionId = submissions[0].id;
		}

		devices = await unroll(snapshot.staging.devices({ submissionId }));
		t.assert.deepStrictEqual(devices.length, 2);

		devicePermutations = await unroll(
			snapshot.staging.devicePermutations({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutations.length, 2);

		const deviceWithEntities = devices.filter(
			(device) => device.model === light1.model,
		);
		t.assert.deepStrictEqual(deviceWithEntities.length, 1);

		devicePermutationLinks = await unroll(
			snapshot.staging.devicePermutationLinks({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutationLinks.length, 1);

		const devicePermutationWithEntities = devicePermutations.filter(
			(devicePermutation) =>
				devicePermutation.deviceId === deviceWithEntities[0].id,
		);
		t.assert.deepStrictEqual(devicePermutationWithEntities.length, 1);

		devicePermutationEntities = await unroll(
			snapshot.staging.entities({
				submissionId,
				devicePermutationId: devicePermutationWithEntities[0].id,
			}),
		);
		t.assert.deepStrictEqual(devicePermutationEntities.length, 1);

		integrationEntities = await unroll(
			snapshot.staging.entities({
				submissionId,
				integration: "hue",
			}),
		);
		t.assert.deepStrictEqual(integrationEntities.length, 1);
	}

	t.mock.timers.tick(2000);

	{
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(handle);

		let submissionId;
		{
			const submissions = await unroll(
				snapshot.staging.submissions({ subject }),
			);
			submissionId = submissions[0].id;
		}

		// reuse equivalent device
		t.assert.deepStrictEqual(
			await unroll(snapshot.staging.devices({ submissionId })),
			devices,
		);

		// reuse equivalent device permutation
		t.assert.deepStrictEqual(
			await unroll(snapshot.staging.devicePermutations({ submissionId })),
			devicePermutations,
		);

		const deviceWithEntities = devices.filter(
			(device) => device.model === light1.model,
		);
		t.assert.deepStrictEqual(deviceWithEntities.length, 1);

		// device links should not be deduplicated
		t.assert.notDeepStrictEqual(
			await unroll(snapshot.staging.devicePermutationLinks({ submissionId })),
			devicePermutationLinks,
		);

		const devicePermutationWithEntities = devicePermutations.filter(
			(devicePermutation) =>
				devicePermutation.deviceId === deviceWithEntities[0].id,
		);
		t.assert.deepStrictEqual(devicePermutationWithEntities.length, 1);

		devicePermutationEntities = await unroll(
			snapshot.staging.entities({
				submissionId,
				devicePermutationId: devicePermutationWithEntities[0].id,
			}),
		);
		t.assert.deepStrictEqual(devicePermutationEntities.length, 1);

		integrationEntities = await unroll(
			snapshot.staging.entities({
				submissionId,
				integration: "hue",
			}),
		);
		t.assert.deepStrictEqual(integrationEntities.length, 1);
	}

	t.mock.timers.reset();
});

test("snapshot duplicate within snapshot", async (t: TestContext) => {
	await using database = await testDatabase(false);

	const snapshot = new Snapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	{
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(handle, "hue", light1, [entity1]);
		await snapshot.attach.device(handle, "hue", light1, [entity1]);

		await snapshot.finalize(handle);
	}

	const snapshots = await unroll(snapshot.staging.submissions({ subject }));
	t.assert.deepStrictEqual(snapshots.length, 1);

	const submissionId = snapshots[0].id;

	const devices = await unroll(snapshot.staging.devices({ submissionId }));
	t.assert.deepStrictEqual(devices.length, 1);

	const devicePermutations = await unroll(
		snapshot.staging.devicePermutations({ submissionId }),
	);
	t.assert.deepStrictEqual(devicePermutations.length, 1);

	const deviceEntities = await unroll(
		snapshot.staging.entities({
			submissionId,
			devicePermutationId: devicePermutations[0].id,
		}),
	);
	t.assert.deepStrictEqual(deviceEntities.length, 1);
});

test("snapshot links", async (t: TestContext) => {
	await using database = await testDatabase(false);

	const snapshot = new Snapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	{
		const voucher = snapshot.voucher.create(new Date(), subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(
			handle,
			"hue",
			{
				...light1,
				via_device: ["hue", floor(1)],
			},
			[],
		);

		await snapshot.attach.device(handle, "hue", hub1, []);

		await snapshot.finalize(handle);
	}

	const snapshots = await unroll(snapshot.staging.submissions({ subject }));
	t.assert.deepStrictEqual(snapshots.length, 1);

	const submissionId = snapshots[0].id;

	const devices = await unroll(snapshot.staging.devices({ submissionId }));
	t.assert.deepStrictEqual(devices.length, 2);

	const devicePermutations = await unroll(
		snapshot.staging.devicePermutations({ submissionId }),
	);
	t.assert.deepStrictEqual(devicePermutations.length, 2);

	const parentDevice = devices.filter((device) => device.model === hub1.model);
	t.assert.deepStrictEqual(parentDevice.length, 1);

	const childDevice = devices.filter((device) => device.model === light1.model);
	t.assert.deepStrictEqual(childDevice.length, 1);

	const parentDevicePermutation = devicePermutations.filter(
		(devicePermutation) => devicePermutation.deviceId === parentDevice[0].id,
	);
	t.assert.deepStrictEqual(parentDevicePermutation.length, 1);

	const childDevicePermutation = devicePermutations.filter(
		(devicePermutation) => devicePermutation.deviceId === childDevice[0].id,
	);
	t.assert.deepStrictEqual(childDevicePermutation.length, 1);

	t.assert.partialDeepStrictEqual(
		await unroll(snapshot.staging.devicePermutationLinks({ submissionId })),
		[
			{
				parentDevicePermutationId: parentDevicePermutation[0].id,
				childDevicePermutationId: childDevicePermutation[0].id,
			},
		],
	);
});
