import { randomBytes } from "node:crypto";
import { describe, type TestContext, test } from "node:test";

import { addMilliseconds, addSeconds } from "date-fns";

import { floor, type Integer } from "../../type/codec/integer";
import { uuid } from "../../type/codec/uuid";
import { isNone, isSome } from "../../type/maybe";
import { unroll } from "../../utility/iterable";
import { omit } from "../../utility/omit";
import { testDatabase } from "../database/utility";
import { StubIntrospection } from "../introspect/stub";
import { type ISnapshot, Snapshot, type SnapshotHandle } from "../snapshot";
import { type IVoucher, Voucher } from "../voucher";

import type { IDatabase } from "../database";

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

const entity2 = {
	assumed_state: false,
	domain: "button",
	entity_category: null,
	has_entity_name: true,
	original_device_class: null,
	unit_of_measurement: null,
} as const;

const entity3 = {
	assumed_state: false,
	domain: "fan",
	entity_category: null,
	has_entity_name: true,
	original_device_class: null,
	unit_of_measurement: null,
} as const;

const buildSnapshot = (
	database: IDatabase<"staging">,
	voucher: IVoucher,
	expectedAfter?: Integer,
	ttl?: Integer,
): ISnapshot =>
	new Snapshot(database, new StubIntrospection(), voucher, {
		voucher: {
			expectedAfter: expectedAfter ?? floor(60 * 60 * 23),
			ttl: ttl ?? floor(60 * 60 * 2),
		},
	});

test("snapshot voucher creation", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const expectedAfter = floor(10);
	const ttl = floor(5);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
		expectedAfter,
		ttl,
	);

	t.mock.timers.enable({ apis: ["Date"] });

	{
		const voucher = snapshot.voucher.initial();
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");
	}

	{
		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");

		const peeked = Voucher.peek(deserialized.voucher);
		t.assert.partialDeepStrictEqual(peeked, {
			sub: subject,
		});
	}

	describe("subject should be transferred into subsequent voucher", () => {
		const subject = uuid();
		const initial = snapshot.voucher.initial(subject);
		const subsequent = snapshot.voucher.subsequent(initial);

		const serialized = snapshot.voucher.serialize(subsequent);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");

		const peeked = Voucher.peek(deserialized.voucher);
		t.assert.partialDeepStrictEqual(peeked, {
			sub: subject,
		});
	});

	describe("should successfully decode even when expired", () => {
		const initial = snapshot.voucher.initial();
		const subsequent = snapshot.voucher.subsequent(initial);

		t.mock.timers.tick(expectedAfter + ttl * 1000 + 1);

		t.assert.ok(snapshot.voucher.expired(subsequent));

		const serialized = snapshot.voucher.serialize(subsequent);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");
	});

	{
		const voucher = snapshot.voucher.initial();
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
	await using database = await testDatabase("staging", true);

	const ttl = floor(5);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
		undefined,
		ttl,
	);

	const now = new Date(Math.floor(Date.now() / 1000) * 1000);
	t.mock.timers.enable({ apis: ["Date"], now });

	await describe("should persist submission", async () => {
		const subject = uuid();
		const hash = { version: 1, hash: Buffer.alloc(32, 0xa) } as const;
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		{
			const unrolled = await unroll(snapshot.staging.submissions({ subject }));
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				subject,
				hassVersion: "2025.11.0",
				hash: undefined,
				createdAt: now,
				completedAt: undefined,
			});
		}

		await snapshot.finalize(handle, hash);

		{
			const unrolled = await unroll(snapshot.staging.submissions({ subject }));
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				subject,
				hassVersion: "2025.11.0",
				hash,
				createdAt: now,
				completedAt: now,
			});
		}
	});

	await describe("should use provided creation date", async () => {
		const at = addSeconds(now, -10);
		const hash = { version: 1, hash: Buffer.alloc(32, 0xb) } as const;
		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0", at);
		t.assert.ok(isSome(handle));

		{
			const unrolled = await unroll(snapshot.staging.submissions({ subject }));
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				subject,
				hassVersion: "2025.11.0",
				createdAt: at,
				hash: undefined,
				completedAt: undefined,
			});
		}

		await snapshot.finalize(handle, hash);

		{
			const unrolled = await unroll(snapshot.staging.submissions({ subject }));
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				subject,
				hassVersion: "2025.11.0",
				hash,
				createdAt: at,
				completedAt: now,
			});
		}
	});

	{
		const subject = uuid();

		const voucher1 = snapshot.voucher.initial(subject);
		const handle1 = await snapshot.create(voucher1, "2025.11.0");
		const hash1 = { version: 1, hash: Buffer.alloc(32, 0xc) } as const;
		t.assert.ok(isSome(handle1));

		const voucher2 = snapshot.voucher.initial(subject);
		const handle2 = await snapshot.create(voucher2, "2025.11.1");
		const hash2 = { version: 1, hash: Buffer.alloc(32, 0xd) } as const;
		t.assert.ok(isSome(handle2));

		await describe("should only yield complete", async () => {
			t.assert.deepStrictEqual(
				(
					await unroll(
						snapshot.staging.submissions({
							a: new Date(0),
							b: now,
							complete: true,
						}),
					)
				).filter((submission) => submission.subject === subject),
				[],
			);
		});

		await describe("should only yield incomplete", async () => {
			const unrolled = (
				await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: now,
						complete: false,
					}),
				)
			)
				.filter((submission) => submission.subject === subject)
				.sort(
					// order indeterminate as clock is not ticking
					(a, b) => a.hassVersion.localeCompare(b.hassVersion),
				);

			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.deepStrictEqual(
				unrolled.map((r) => omit(r, "id")),
				[
					{
						subject,
						createdAt: now,
						hassVersion: "2025.11.0",
						hash: undefined,
						completedAt: undefined,
					},
					{
						subject,
						createdAt: now,
						hassVersion: "2025.11.1",
						hash: undefined,
						completedAt: undefined,
					},
				],
			);
		});

		await describe("should yield complete and incomplete", async () => {
			await snapshot.finalize(handle2, hash2);

			const unrolled = (
				await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: now,
					}),
				)
			)
				.filter((submission) => submission.subject === subject)
				.sort(
					// order indeterminate as clock is not ticking
					(a, b) => a.hassVersion.localeCompare(b.hassVersion),
				);

			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.deepStrictEqual(
				unrolled.map((r) => omit(r, "id")),
				[
					{
						subject,
						createdAt: now,
						hash: undefined,
						hassVersion: "2025.11.0",
						completedAt: undefined,
					},
					{
						subject,
						createdAt: now,
						hassVersion: "2025.11.1",
						hash: hash2,
						completedAt: now,
					},
				],
			);
		});

		await snapshot.finalize(handle1, hash1);

		await describe("should only yield complete", async () => {
			const unrolled = (
				await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: now,
						complete: true,
					}),
				)
			)
				.filter((submission) => submission.subject === subject)
				.sort(
					// order indeterminate as clock is not ticking
					(a, b) => a.hassVersion.localeCompare(b.hassVersion),
				);

			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.deepStrictEqual(
				unrolled.map((r) => omit(r, "id")),
				[
					{
						subject,
						createdAt: now,
						hash: hash1,
						hassVersion: "2025.11.0",
						completedAt: now,
					},
					{
						subject,
						createdAt: now,
						hash: hash2,
						hassVersion: "2025.11.1",
						completedAt: now,
					},
				],
			);
		});

		await describe("should only yield incomplete", async () => {
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
		});
	}

	const initial = snapshot.voucher.initial();
	t.mock.timers.tick(ttl * 1000 + 1);

	await describe("should provide handle for unused expired voucher", async () => {
		const handle = await snapshot.create(initial, "2025.11.1");
		t.assert.ok(isSome(handle));
		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xe),
		});
	});

	await describe("should not provide handle for used expired voucher", async () => {
		const handle = await snapshot.create(initial, "2025.11.1");
		t.assert.ok(isNone(handle));
	});

	await describe("should provide handle for used expired voucher with set time", async () => {
		const handle = await snapshot.create(
			initial,
			"2025.11.1",
			addMilliseconds(new Date(), -1),
		);
		t.assert.ok(isSome(handle));
	});

	t.mock.timers.reset();
});

test("snapshot ordering", async (t: TestContext) => {
	const subject = uuid();

	test("scoped to subject", async (t: TestContext) => {
		{
			await using database = await testDatabase("staging", true);

			const snapshot = buildSnapshot(
				database,
				new Voucher(randomBytes(64).toString()),
			);

			t.mock.timers.enable({ apis: ["Date"] });
			{
				const voucher = snapshot.voucher.initial(subject);
				const handle = await snapshot.create(voucher, "2025.11.0");
				t.assert.ok(isSome(handle));
				await snapshot.finalize(handle, {
					version: 1,
					hash: Buffer.alloc(32, 0xf),
				});
			}

			t.mock.timers.tick(2000);

			{
				const voucher = snapshot.voucher.initial(subject);
				const handle = await snapshot.create(voucher, "2025.11.0");
				t.assert.ok(isSome(handle));
				await snapshot.finalize(handle, {
					version: 1,
					hash: Buffer.alloc(32, 0xaa),
				});
			}

			const submissions = await unroll(
				snapshot.staging.submissions({ subject }),
			);
			t.assert.deepStrictEqual(submissions.length, 2);
			t.assert.ok(submissions[0].createdAt > submissions[1].createdAt);

			t.mock.timers.reset();
		}
	});

	test("scoped to created between", async (t: TestContext) => {
		{
			await using database = await testDatabase("staging", true);

			const snapshot = buildSnapshot(
				database,
				new Voucher(randomBytes(64).toString()),
			);

			t.mock.timers.enable({ apis: ["Date"] });
			{
				const voucher = snapshot.voucher.initial(subject);
				const handle = await snapshot.create(voucher, "2025.11.0");
				t.assert.ok(isSome(handle));
				await snapshot.finalize(handle, {
					version: 1,
					hash: Buffer.alloc(32, 0xab),
				});
			}

			t.mock.timers.tick(2000);

			{
				const voucher = snapshot.voucher.initial(subject);
				const handle = await snapshot.create(voucher, "2025.11.0");
				t.assert.ok(isSome(handle));
				await snapshot.finalize(handle, {
					version: 1,
					hash: Buffer.alloc(32, 0xac),
				});
			}

			const submissions = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			);
			t.assert.deepStrictEqual(submissions.length, 2);
			t.assert.ok(submissions[0].createdAt > submissions[1].createdAt);

			t.mock.timers.reset();
		}
	});
});

test("snapshot deduplication", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
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
	};

	t.mock.timers.enable({ apis: ["Date"] });

	let devices;
	let devicePermutations;
	let devicePermutationLinks;
	let devicePermutationEntities;
	{
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xad),
		});

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
	}

	t.mock.timers.tick(2000);

	{
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xae),
		});

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

		// reuse equivalent device links
		t.assert.deepStrictEqual(
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
	}

	t.mock.timers.reset();
});

test("snapshot entity composition", async (t: TestContext) => {
	t.test("duplicate entities", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const subject = uuid();

		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(handle, "hue", light1, [entity1, entity1]);

		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xaf),
		});

		const submissions = await unroll(snapshot.staging.submissions({ subject }));
		const submissionId = submissions[0].id;

		const devicePermutations = await unroll(
			snapshot.staging.devicePermutations({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutations.length, 1);

		const devicePermutationId = devicePermutations[0].id;

		t.assert.partialDeepStrictEqual(
			await unroll(snapshot.staging.entities({ devicePermutationId })),
			[[1, [{ domain: entity1.domain }]]],
		);
	});

	t.test("order-independent grouping", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const subject = uuid();

		let devicePermutationId;
		{
			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));

			await snapshot.attach.device(handle, "hue", light1, []);

			await snapshot.finalize(handle, {
				version: 1,
				hash: Buffer.alloc(32, 0xba),
			});

			const submissions = await unroll(
				snapshot.staging.submissions({ subject }),
			);
			const submissionId = submissions[0].id;

			const devicePermutations = await unroll(
				snapshot.staging.devicePermutations({ submissionId }),
			);
			t.assert.deepStrictEqual(devicePermutations.length, 1);

			devicePermutationId = devicePermutations[0].id;
		}

		const attaching = [
			[entity1, entity2, entity3, entity3],
			[entity1, entity3, entity2],
			[entity2, entity1, entity3],
			[entity2, entity3, entity1],
			[entity3, entity1, entity2],
			[entity3, entity2, entity1],
		] as const;

		for (const entities of attaching) {
			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher, "2025.11.0");
			t.assert.ok(isSome(handle));

			await snapshot.attach.device(handle, "hue", light1, entities);

			await snapshot.finalize(handle, {
				version: 1,
				hash: Buffer.alloc(32, 0xbb),
			});
		}

		const unrolled = await unroll(
			snapshot.staging.entities({ devicePermutationId }),
		);
		t.assert.deepStrictEqual(unrolled.length, 1);

		unrolled[0][1].sort((a, b) => a.domain.localeCompare(b.domain));

		t.assert.partialDeepStrictEqual(unrolled, [
			[
				attaching.length,
				[entity1, entity2, entity3]
					.map((item) => ({ domain: item.domain }))
					.sort((a, b) => a.domain.localeCompare(b.domain)),
			],
		]);
	});
});

test("snapshot duplicate within snapshot", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	{
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, "2025.11.0");
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(handle, "hue", light1, [entity1]);
		await snapshot.attach.device(handle, "hue", light1, [entity1]);

		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xbc),
		});
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
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	{
		const voucher = snapshot.voucher.initial(subject);
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

		await snapshot.finalize(handle, {
			version: 1,
			hash: Buffer.alloc(32, 0xbd),
		});
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

test("snapshot deletion", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	const voucher = snapshot.voucher.initial(subject);
	const handle = await snapshot.create(voucher, "2025.11.0");
	t.assert.ok(isSome(handle));

	await snapshot.attach.device(handle, "hue", light1, [entity1]);

	await snapshot.finalize(handle, { version: 1, hash: Buffer.alloc(32, 0xbe) });

	const { id } = Voucher.peek(voucher);

	const before = await unroll(snapshot.staging.submissions({ subject }));
	t.assert.deepStrictEqual(before.length, 1);

	await snapshot.delete(id);

	const after = await unroll(snapshot.staging.submissions({ subject }));

	t.assert.deepStrictEqual(after.length, 0);
});

test("snapshot hash", async (t: TestContext) => {
	const { serialize, deserialize } = Snapshot.hash;

	t.test("serialize produces expected format", (t: TestContext) => {
		const hash = Buffer.alloc(32, 0xca);
		const serialized = serialize({ version: 1, hash });
		t.assert.match(serialized, /^1-/);
		// base64 of 32 bytes is 44 characters (with padding)
		const encoded = serialized.slice(2);
		t.assert.strictEqual(encoded.length, 44);
		// base64 alphabet must not contain "-"
		t.assert.doesNotMatch(encoded, /-/);
	});

	t.test("roundtrip", (t: TestContext) => {
		const hash = randomBytes(32);
		const serialized = serialize({ version: 1, hash });
		const result = deserialize(serialized);
		t.assert.ok(isSome(result));
		t.assert.strictEqual(result.version, 1);
		t.assert.deepStrictEqual(result.hash, hash);
	});

	t.test("deserialize returns null for unknown version", (t: TestContext) => {
		const hash = randomBytes(32);
		const base64 = hash.toString("base64");
		t.assert.ok(isNone(deserialize(`2-${base64}`)));
		t.assert.ok(isNone(deserialize(`abc-${base64}`)));
	});

	t.test(
		"deserialize returns null when hash is wrong length",
		(t: TestContext) => {
			const shortHash = randomBytes(16);
			const serialized = `1-${shortHash.toString("base64")}`;
			t.assert.ok(isNone(deserialize(serialized)));
		},
	);

	t.test("deserialize returns null for empty string", (t: TestContext) => {
		t.assert.ok(isNone(deserialize("")));
	});

	t.test(
		"deserialize returns null for string without separator",
		(t: TestContext) => {
			const hash = randomBytes(32);
			t.assert.ok(isNone(deserialize(hash.toString("base64"))));
		},
	);
});
