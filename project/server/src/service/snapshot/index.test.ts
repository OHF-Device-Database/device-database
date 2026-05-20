import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { addMilliseconds, addSeconds } from "date-fns";

import { logger } from "../../logger";
import { floor, type Integer } from "../../type/codec/integer";
import { type Uuid, uuid } from "../../type/codec/uuid";
import { isNone, isSome } from "../../type/maybe";
import { floorTime } from "../../utility/floor-time";
import { unroll } from "../../utility/iterable";
import { omit } from "../../utility/omit";
import { testDatabase } from "../database/utility";
import { StubIntrospection } from "../introspect/stub";
import { Snapshot, type SnapshotHandleAttachable } from "../snapshot";
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
	voucher?: IVoucher,
	expectedAfter?: Integer,
	ttl?: Integer,
) =>
	new Snapshot(
		database,
		new StubIntrospection(),
		voucher ?? new Voucher(randomBytes(64).toString()),
		{
			voucher: {
				expectedAfter: expectedAfter ?? floor(60 * 60 * 23),
				ttl: ttl ?? floor(60 * 60 * 2),
			},
		},
	);

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

	t.test("initial without explicitly provided subject", (t: TestContext) => {
		const voucher = snapshot.voucher.initial();
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");
	});

	t.test("initial with explicitly provided subject", (t: TestContext) => {
		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");

		const peeked = Voucher.peek(deserialized.voucher);
		t.assert.partialDeepStrictEqual(peeked, {
			sub: subject,
		});
	});

	t.test(
		"subject should be transferred into subsequent voucher",
		(t: TestContext) => {
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
		},
	);

	t.test("should successfully decode even when expired", (t: TestContext) => {
		t.mock.timers.enable({ apis: ["Date"] });

		const initial = snapshot.voucher.initial();
		const subsequent = snapshot.voucher.subsequent(initial);

		t.mock.timers.tick(expectedAfter + ttl * 1000 + 1);

		t.assert.ok(snapshot.voucher.expired(subsequent));

		const serialized = snapshot.voucher.serialize(subsequent);
		const deserialized = snapshot.voucher.deserialize(serialized);
		t.assert.ok(deserialized.kind === "success");
	});

	t.test("corrupt voucher", (t: TestContext) => {
		const voucher = snapshot.voucher.initial();
		const serialized = snapshot.voucher.serialize(voucher);
		const deserialized = snapshot.voucher.deserialize(
			`foo${serialized.slice(3)}`,
		);
		t.assert.partialDeepStrictEqual(deserialized, {
			kind: "error",
			cause: "malformed",
		});
	});
});

test("snapshot creation", async (t: TestContext) => {
	t.test("hash provided upon finalization", async (t) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const epoch = floorTime();
		t.mock.timers.enable({ apis: ["Date"], now: epoch });

		let submissionId: Uuid;
		const hash = { version: 1, hash: Buffer.alloc(32, 0xa) } as const;
		const hassVersion = "2026.4.0";

		await t.test("non-duplicate submission", async (t: TestContext) => {
			const subject = uuid();

			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher);
			t.assert.ok(isSome(handle));

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					hash: undefined,
					createdAt: epoch,
					completedAt: undefined,
				});
			}

			await snapshot.finalize(handle, hash, hassVersion);

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					hash,
					createdAt: epoch,
					completedAt: epoch,
				});

				submissionId = unrolled[0].id;
			}

			{
				const unrolled = await unroll(
					snapshot.staging.attribution.submissions({ subject }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					submissionId,
					subject,
					hassVersion,
					createdAt: epoch,
				});
			}
		});

		t.mock.timers.tick(1000);

		await t.test("duplicate submission", async (t: TestContext) => {
			const subject = uuid();

			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher);
			t.assert.ok(isSome(handle));

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(
					unrolled.length,
					2,
					"temporarily two submissions as hash is only provided during finalization",
				);

				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					hash: undefined,
					createdAt: new Date(),
					completedAt: undefined,
				});
			}

			await snapshot.finalize(handle, hash, hassVersion);

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(
					unrolled.length,
					1,
					"only one submission again, as second submission was duplicate",
				);
				t.assert.deepStrictEqual(unrolled[0], {
					id: submissionId,
					hash,
					createdAt: epoch,
					completedAt: epoch,
				});

				submissionId = unrolled[0].id;
			}

			{
				const unrolled = await unroll(
					snapshot.staging.attribution.submissions({ subject }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					submissionId,
					subject,
					hassVersion,
					createdAt: new Date(),
				});
			}
		});
	});

	t.test("hash provided upon creation", async (t: TestContext) => {
		// duplicate detection can happen immediately
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const epoch = floorTime();
		t.mock.timers.enable({ apis: ["Date"], now: epoch });

		let submissionId: Uuid;
		const hash = { version: 1, hash: Buffer.alloc(32, 0xa) } as const;
		const hassVersion = "2026.4.0";

		await t.test("non-duplicate submission", async (t: TestContext) => {
			const subject = uuid();

			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher, hash);
			t.assert.ok(isSome(handle));

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(
					omit(unrolled[0], "id"),
					{
						hash: undefined,
						createdAt: epoch,
						completedAt: undefined,
					},
					"hash not yet persisted",
				);
			}

			t.assert.ok(!Snapshot.isDuplicate(handle));

			await snapshot.finalize(handle, hassVersion);

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(
					omit(unrolled[0], "id"),
					{
						hash,
						createdAt: epoch,
						completedAt: epoch,
					},
					"hash persisted and completion timestamp set",
				);

				submissionId = unrolled[0].id;
			}

			{
				const unrolled = await unroll(
					snapshot.staging.attribution.submissions({ subject }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
					submissionId,
					subject,
					hassVersion,
					createdAt: epoch,
				});
			}
		});

		t.mock.timers.tick(1000);

		await t.test("duplicate submission", async (t: TestContext) => {
			const subject = uuid();

			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher, hash);
			t.assert.ok(isSome(handle));

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);

				t.assert.deepStrictEqual(
					unrolled[0],
					{
						id: submissionId,
						hash,
						createdAt: epoch,
						completedAt: epoch,
					},
					"duplicate never created as complete submission with hash already exists",
				);
			}

			await snapshot.finalize(handle, hassVersion);

			{
				const unrolled = await unroll(
					snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(
					unrolled[0],
					{
						id: submissionId,
						hash,
						createdAt: epoch,
						completedAt: epoch,
					},
					"still only original",
				);

				submissionId = unrolled[0].id;
			}

			{
				const unrolled = await unroll(
					snapshot.staging.attribution.submissions({ subject }),
				);
				t.assert.deepStrictEqual(unrolled.length, 1);
				t.assert.deepStrictEqual(
					omit(unrolled[0], "id"),
					{
						submissionId,
						subject,
						hassVersion,
						createdAt: new Date(),
					},
					"attributed to original",
				);
			}
		});
	});

	t.test("concurrent submission with same hash", async (t: TestContext) => {
		// two subjects submit with the same hash concurrently — both handles are valid during
		// the in-flight window, but once (b) finalizes, (a) is merged into it upon its own finalization
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const epoch = floorTime();
		t.mock.timers.enable({ apis: ["Date"], now: epoch });

		const subjectA = uuid();
		const subjectB = uuid();

		const hash = { version: 1, hash: Buffer.alloc(32, 0xa) } as const;
		const hassVersion = "2026.4.0";

		let handleA;
		let submissionA;
		{
			const voucher = snapshot.voucher.initial(subjectA);
			const handle = await snapshot.create(voucher, hash);
			t.assert.ok(isSome(handle));

			const unrolled = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(
				omit(unrolled[0], "id"),
				{
					hash: undefined,
					createdAt: epoch,
					completedAt: undefined,
				},
				"submission (a) is present",
			);

			t.assert.ok(!Snapshot.isDuplicate(handle));

			handleA = handle;
			submissionA = unrolled[0].id;
		}

		const now = addMilliseconds(epoch, 1000);
		t.mock.timers.setTime(Math.floor(now.getTime()));

		const voucher = snapshot.voucher.initial(subjectB);
		const handle = await snapshot.create(voucher, hash);
		t.assert.ok(isSome(handle));

		let submissionB;
		{
			const unrolled = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			);
			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.deepStrictEqual(
				[omit(unrolled[0], "id"), unrolled[1]],
				[
					{
						hash: undefined,
						createdAt: now,
						completedAt: undefined,
					},
					{
						id: submissionA,
						hash: undefined,
						createdAt: epoch,
						completedAt: undefined,
					},
				],
				"submissions (a) and (b) are present",
			);

			submissionB = unrolled[0].id;
		}

		t.assert.ok(!Snapshot.isDuplicate(handle));

		await snapshot.finalize(handle, hassVersion);

		t.assert.deepStrictEqual(
			await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			),
			[
				{
					id: submissionB,
					hash,
					createdAt: now,
					completedAt: now,
				},
				{
					id: submissionA,
					hash: undefined,
					createdAt: epoch,
					completedAt: undefined,
				},
			],
			"submission (a) and (b) are present and (b) is now finalized",
		);

		{
			const unrolled = await unroll(
				snapshot.staging.attribution.submissions({ subject: subjectB }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(
				omit(unrolled[0], "id"),
				{
					submissionId: submissionB,
					subject: subjectB,
					hassVersion,
					createdAt: now,
				},

				"attributed to submission (b)",
			);
		}

		await snapshot.finalize(handleA, hassVersion);

		t.assert.deepStrictEqual(
			await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			),
			[
				{
					id: submissionB,
					hash,
					createdAt: now,
					completedAt: now,
				},
			],
			"only (b) submission left",
		);

		{
			const unrolled = await unroll(
				snapshot.staging.attribution.submissions({ subject: subjectA }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(
				omit(unrolled[0], "id"),
				{
					submissionId: submissionB,
					subject: subjectA,
					hassVersion,
					createdAt: now,
				},

				"attributed to submission (b)",
			);
		}
	});

	t.test("should use provided creation date", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const now = floorTime();
		t.mock.timers.enable({ apis: ["Date"], now });

		const hassVersion = "2026.4.0";

		const at = addSeconds(now, 10);
		const hash = { version: 1, hash: Buffer.alloc(32, 0xb) } as const;
		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, at);
		t.assert.ok(isSome(handle));

		{
			const unrolled = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: at }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				createdAt: at,
				hash: undefined,
				completedAt: undefined,
			});
		}

		await snapshot.finalize(handle, hash, hassVersion);

		{
			const unrolled = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: at }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
			t.assert.deepStrictEqual(omit(unrolled[0], "id"), {
				hash,
				createdAt: at,
				completedAt: now,
			});
		}
	});

	t.test("expired voucher", async (t: TestContext) => {
		logger.level = "error";

		await using database = await testDatabase("staging", true);

		const ttl = floor(5);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
			undefined,
			ttl,
		);

		const now = floorTime();
		t.mock.timers.enable({ apis: ["Date"], now });

		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);

		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		t.mock.timers.tick(ttl * 1000 + 1);

		await t.test(
			"should not provide handle for expired voucher",
			async (t: TestContext) => {
				const handle = await snapshot.create(voucher);
				t.assert.ok(isNone(handle));
			},
		);

		await t.test(
			"should provide handle for expired voucher with provided timestamp within ttl",
			async (t: TestContext) => {
				const handle = await snapshot.create(
					voucher,
					addMilliseconds(new Date(), -1),
				);
				t.assert.ok(isSome(handle));
			},
		);

		await t.test(
			"should not provide handle for expired voucher with provided timestamp outside ttl",
			async (t: TestContext) => {
				const handle = await snapshot.create(voucher, new Date());
				t.assert.ok(isNone(handle));
			},
		);

		t.mock.timers.setTime(now.getTime());

		await snapshot.finalize(
			handle,
			{ version: 1, hash: Buffer.alloc(32, 0xb) },
			"2026.4.0",
		);

		await t.test(
			"should not provide handle for used voucher",
			async (t: TestContext) => {
				const handle = await snapshot.create(voucher);
				t.assert.ok(isNone(handle));
			},
		);
	});
});

test("snapshot attribution", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();
	const hash = { version: 1, hash: Buffer.alloc(32, 0xa) } as const;
	const hassVersion = "2026.4.0";

	let submissionId: Uuid | undefined;
	{
		const voucher = snapshot.voucher.initial();
		const handle = await snapshot.create(voucher, hash);
		t.assert.ok(isSome(handle));

		await snapshot.finalize(handle, hassVersion);

		const unrolled = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
		t.assert.deepStrictEqual(unrolled.length, 1);
		submissionId = unrolled[0].id;
	}

	const n = 5;
	for (let i = 0; i < n; i++) {
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher, hash);
		t.assert.ok(isSome(handle));

		await snapshot.finalize(handle, hassVersion);
	}

	const unrolled = await unroll(
		snapshot.staging.attribution.submissions({ subject }),
	);

	t.assert.deepStrictEqual(unrolled.length, n);

	t.assert.deepStrictEqual(
		unrolled.map((item) => omit(omit(item, "id"), "createdAt")),
		Array.from({ length: n }).map(() => ({
			submissionId,
			subject,
			hassVersion,
		})),
	);
});

test("snapshot ordering", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	const epoch = floorTime();
	t.mock.timers.enable({ apis: ["Date"], now: epoch });

	{
		const voucher1 = snapshot.voucher.initial(subject);
		const handle1 = await snapshot.create(voucher1);
		const hash1 = { version: 1, hash: Buffer.alloc(32, 0xc) } as const;
		t.assert.ok(isSome(handle1));

		// otherwise creation time of both snapshots might be equal, as it is rounded down to second
		t.mock.timers.tick(1000);

		const voucher2 = snapshot.voucher.initial(subject);
		const handle2 = await snapshot.create(voucher2);
		const hash2 = { version: 1, hash: Buffer.alloc(32, 0xd) } as const;
		t.assert.ok(isSome(handle2));

		await t.test("should only yield complete (1)", async (t: TestContext) => {
			t.assert.deepStrictEqual(
				await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: epoch,
						complete: true,
					}),
				),
				[],
			);
		});

		await t.test("should only yield incomplete (1)", async (t: TestContext) => {
			const unrolled = await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: new Date(),
					complete: false,
				}),
			);

			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.deepStrictEqual(
				unrolled.map((r) => omit(r, "id")),
				[
					{
						createdAt: new Date(),
						hash: undefined,
						completedAt: undefined,
					},
					{
						createdAt: epoch,
						hash: undefined,
						completedAt: undefined,
					},
				],
			);
		});

		await t.test(
			"should yield complete and incomplete",
			async (t: TestContext) => {
				await snapshot.finalize(handle2, hash2, "2026.4.0");

				const unrolled = await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: new Date(),
					}),
				);

				t.assert.deepStrictEqual(unrolled.length, 2);
				t.assert.partialDeepStrictEqual(
					unrolled.map((r) => omit(r, "id")),
					[
						{
							createdAt: new Date(),
							hash: hash2,
							completedAt: new Date(),
						},
						{
							createdAt: epoch,
							hash: undefined,
							completedAt: undefined,
						},
					],
				);
			},
		);

		await snapshot.finalize(handle1, hash1, "2025.11.0");

		await t.test("should only yield complete (2)", async (t: TestContext) => {
			const unrolled = await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: new Date(),
					complete: true,
				}),
			);

			t.assert.deepStrictEqual(unrolled.length, 2);
			t.assert.partialDeepStrictEqual(
				unrolled.map((r) => omit(r, "id")),
				[
					{
						createdAt: new Date(),
						hash: hash2,
						completedAt: new Date(),
					},
					{
						createdAt: epoch,
						hash: hash1,
						completedAt: new Date(),
					},
				],
			);
		});

		await t.test("should only yield incomplete (2)", async () => {
			t.assert.partialDeepStrictEqual(
				await unroll(
					snapshot.staging.submissions({
						a: new Date(0),
						b: new Date(),
						complete: false,
					}),
				),
				[],
			);
		});
	}

	await t.test("scoped to created between", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const now = floorTime();

		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));
		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xab),
			},
			"2025.11.0",
		);

		{
			const unrolled = await unroll(
				snapshot.staging.submissions({ a: now, b: new Date() }),
			);
			t.assert.deepStrictEqual(unrolled.length, 1);
		}

		{
			const unrolled = await unroll(
				snapshot.staging.submissions({
					a: new Date(0),
					b: addMilliseconds(now, -1),
				}),
			);
			t.assert.deepStrictEqual(unrolled.length, 0);
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

	const attach = async (handle: SnapshotHandleAttachable) => {
		await snapshot.attach.device(
			handle,
			"hue",
			{ ...light1, via_device: ["hue", floor(1)] },
			[entity1],
		);
		await snapshot.attach.device(handle, "hue", light2, []);
	};

	let devices;
	let devicePermutations;
	let devicePermutationLinks;
	let devicePermutationEntities;
	{
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xad),
			},
			"2025.11.0",
		);

		let submissionId;
		{
			const submissions = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
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

	{
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await attach(handle);
		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xae),
			},
			"2025.11.0",
		);

		let submissionId;
		{
			const submissions = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
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
});

test("snapshot entity composition", (t: TestContext) => {
	t.test("duplicate entities", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const subject = uuid();

		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(handle, "hue", light1, [entity1, entity1]);

		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xaf),
			},
			"2025.11.0",
		);

		const submissions = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
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
			const handle = await snapshot.create(voucher);
			t.assert.ok(isSome(handle));

			await snapshot.attach.device(handle, "hue", light1, []);

			await snapshot.finalize(
				handle,
				{
					version: 1,
					hash: Buffer.alloc(32, 0xba),
				},
				"2025.11.0",
			);

			const submissions = await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
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

		for (const [idx, entities] of attaching.entries()) {
			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher);
			t.assert.ok(isSome(handle));

			await snapshot.attach.device(handle, "hue", light1, entities);

			await snapshot.finalize(
				handle,
				{
					version: 1,
					// hash needs to be different across submissions, otherwise only initial one is persisted
					hash: Buffer.alloc(32, 0xbb + idx),
				},
				"2025.11.0",
			);
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
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(handle, "hue", light1, [entity1]);
		await snapshot.attach.device(handle, "hue", light1, [entity1]);

		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xbc),
			},
			"2025.11.0",
		);
	}

	const snapshots = await unroll(
		snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
	);
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
	t.test("non-dangling", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const subject = uuid();

		{
			const voucher = snapshot.voucher.initial(subject);
			const handle = await snapshot.create(voucher);
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

			await snapshot.finalize(
				handle,
				{
					version: 1,
					hash: Buffer.alloc(32, 0xbd),
				},
				"2025.11.0",
			);
		}

		const snapshots = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
		t.assert.deepStrictEqual(snapshots.length, 1);

		const submissionId = snapshots[0].id;

		const devices = await unroll(snapshot.staging.devices({ submissionId }));
		t.assert.deepStrictEqual(devices.length, 2);

		const devicePermutations = await unroll(
			snapshot.staging.devicePermutations({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutations.length, 2);

		const parentDevice = devices.filter(
			(device) => device.model === hub1.model,
		);
		t.assert.deepStrictEqual(parentDevice.length, 1);

		const childDevice = devices.filter(
			(device) => device.model === light1.model,
		);
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

	await t.test("dangling", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		logger.level = "error";

		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(
			handle,
			"hue",
			{ ...light1, via_device: ["foo", floor(0)] },
			[],
		);

		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xbe),
			},
			"2025.11.0",
		);

		const snapshots = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
		t.assert.deepStrictEqual(snapshots.length, 1);

		const submissionId = snapshots[0].id;

		// the device itself should still be persisted
		const devices = await unroll(snapshot.staging.devices({ submissionId }));
		t.assert.deepStrictEqual(devices.length, 1);

		// but no links should have been created since the reference was dangling
		const devicePermutationLinks = await unroll(
			snapshot.staging.devicePermutationLinks({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutationLinks.length, 0);
	});

	await t.test("circular", async (t: TestContext) => {
		await using database = await testDatabase("staging", true);

		const snapshot = buildSnapshot(
			database,
			new Voucher(randomBytes(64).toString()),
		);

		const subject = uuid();
		const voucher = snapshot.voucher.initial(subject);
		const handle = await snapshot.create(voucher);
		t.assert.ok(isSome(handle));

		await snapshot.attach.device(
			handle,
			"hue",
			{ ...hub1, via_device: ["hue", floor(1)] },
			[],
		);

		await snapshot.attach.device(
			handle,
			"hue",
			{ ...light1, via_device: ["hue", floor(0)] },
			[],
		);

		await snapshot.finalize(
			handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xbf),
			},
			"2025.11.0",
		);

		const snapshots = await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		);
		t.assert.deepStrictEqual(snapshots.length, 1);

		const submissionId = snapshots[0].id;

		// both devices should still be persisted
		const devices = await unroll(snapshot.staging.devices({ submissionId }));
		t.assert.deepStrictEqual(devices.length, 2);

		// but no links should have been created since all involved nodes are circular
		const devicePermutationLinks = await unroll(
			snapshot.staging.devicePermutationLinks({ submissionId }),
		);
		t.assert.deepStrictEqual(devicePermutationLinks.length, 0);
	});
});

test("snapshot deletion", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(
		database,
		new Voucher(randomBytes(64).toString()),
	);

	const subject = uuid();

	const voucher = snapshot.voucher.initial(subject);
	const handle = await snapshot.create(voucher);
	t.assert.ok(isSome(handle));

	await snapshot.attach.device(handle, "hue", light1, [entity1]);

	await snapshot.finalize(
		handle,
		{ version: 1, hash: Buffer.alloc(32, 0xbe) },
		"2025.11.0",
	);

	const before = await unroll(
		snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
	);
	t.assert.deepStrictEqual(before.length, 1);

	await snapshot.delete(before[0].id);

	const after = await unroll(
		snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
	);

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
		// base64 alphabet must not contain "-" (which is reserved as the version separator)
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
