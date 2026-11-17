import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { subMinutes } from "date-fns";

import { logger } from "../../../logger";
import { testDatabaseSwappable } from "../../../service/database/utility";
import { StubIntrospection } from "../../../service/introspect/stub";
import { Scheduler } from "../../../service/scheduler";
import { Snapshot } from "../../../service/snapshot";
import { Voucher } from "../../../service/voucher";
import { floor } from "../../../type/codec/integer";
import { uuid } from "../../../type/codec/uuid";
import { floorTime } from "../../../utility/floor-time";
import { unroll } from "../../../utility/iterable";
import { omit } from "../../../utility/omit";
import { ServiceSchedulerScheduledCompactionOptimize } from "./compaction/optimize.service";
import { ServiceSchedulerScheduledCompactionOrphanedAttached } from "./compaction/orphaned/attached.service";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./compaction/orphaned/submission.service";
import { ServiceSchedulerScheduledDatabaseClone } from "./database-clone.service";
import { ServiceSchedulerScheduledDeriveSubject } from "./derive/subject.service";
import { ServiceSchedulerScheduledRetentionRevocation } from "./retention/revocation.service";

import type { Uuid } from "../../../type/codec/uuid";

logger.silent = true;

/** subsequent days without submissions after which a subject is revoked */
const revokeAfter = floor(1);

/** minutes the derived streak is computed over, mirrors `InsertDerivedSubjects` */
const derivedWindow = 25 * 60;

const device1 = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Signify Netherlands B.V.",
	model: "Hue white lamp",
	model_id: "LWB010",
	sw_version: "1.116.3",
	via_device: null,
} as const;

const device2 = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Signify Netherlands B.V.",
	model: "Hue green lamp",
	model_id: "LWB011",
	sw_version: "1.116.4",
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

test("garbage collection", async (t: TestContext) => {
	await using databases = await testDatabaseSwappable("derived", {
		derived: true,
		staging: true,
	});
	const { staging, derived } = databases;

	const snapshot = new Snapshot(
		staging,
		new StubIntrospection(),
		new Voucher(randomBytes(64).toString()),
		{
			voucher: {
				expectedAfter: floor(60 * 60 * 23),
				ttl: floor(60 * 60 * 2),
				minSeq: floor(7),
			},
		},
	);

	const now = floorTime();
	t.mock.timers.enable({ apis: ["Date"], now });

	// attribution is always created with current time, not provided time
	// → mock to use the current time
	const submit = async (
		subject: Uuid,
		at: Date,
		devices: readonly (readonly [string, typeof device1 | typeof device2])[],
	) => {
		t.mock.timers.setTime(at.getTime());

		const created = await snapshot.create(
			snapshot.voucher.initial(subject),
			at,
		);
		t.assert.strictEqual(created.kind, "success");

		for (const [integration, device] of devices) {
			await snapshot.attach.device(created.handle, integration, device, [
				entity1,
			]);
		}

		await snapshot.finalize(
			created.handle,
			{ version: 1, hash: randomBytes(32) },
			"2026.5.0",
		);
	};

	// last submitted after the cutoff elapsed, yet recent enough to still be derived
	const revoked = uuid();
	await submit(revoked, subMinutes(now, derivedWindow - 12), [
		["foo", device1],
	]);
	await submit(revoked, subMinutes(now, revokeAfter * 24 * 60 + 30), [
		["foo", device1],
		["bar", device2],
	]);

	// last submitted recently
	const retained = uuid();
	await submit(retained, subMinutes(now, 120), [["foo", device1]]);
	await submit(retained, subMinutes(now, 60), [["foo", device1]]);

	// the units ahead run against the current time, not the one submissions were placed at
	t.mock.timers.reset();

	const scheduler = new Scheduler(
		[
			new ServiceSchedulerScheduledDatabaseClone(staging),
			new ServiceSchedulerScheduledRetentionRevocation({
				snapshot: { revokeAfter },
			}),
			new ServiceSchedulerScheduledCompactionOrphanedSubmission(),
			new ServiceSchedulerScheduledCompactionOrphanedAttached(),
			new ServiceSchedulerScheduledCompactionOptimize(staging),
			new ServiceSchedulerScheduledDeriveSubject(derived),
		],
		new StubIntrospection(),
	);

	const subjects = () =>
		[
			...derived.raw.query(
				"select subject, streak from derived_subject order by subject",
				{ returnArray: true },
				{},
			),
		] as [subject: string, streak: number][];

	{
		const plan = scheduler.plan(ServiceSchedulerScheduledDeriveSubject.id);
		t.assert.ok(Scheduler.viable(plan));

		await unroll(scheduler.act(plan));
	}

	// both subjects submitted twice within the window, so both carry a streak
	t.assert.deepStrictEqual(
		subjects(),
		[
			[revoked, 1],
			[retained, 1],
		].sort(),
	);

	{
		const plan = scheduler.plan(ServiceSchedulerScheduledCompactionOptimize.id);
		t.assert.ok(Scheduler.viable(plan));

		// everything the unit lists as prerequisite runs ahead of it, in order
		t.assert.deepStrictEqual(
			(await unroll(scheduler.act(plan))).flatMap((status) =>
				status.kind === "success" ? [status.id] : [],
			),
			[
				ServiceSchedulerScheduledDatabaseClone.id,
				ServiceSchedulerScheduledRetentionRevocation.id,
				ServiceSchedulerScheduledCompactionOrphanedSubmission.id,
				ServiceSchedulerScheduledCompactionOrphanedAttached.id,
				ServiceSchedulerScheduledCompactionOptimize.id,
			],
		);
	}

	// the swapped in generation carries the attributions of the retained subject only
	t.assert.deepStrictEqual(
		(
			await unroll(
				snapshot.staging.attribution.submissions({
					a: new Date(0),
					b: new Date(),
				}),
			)
		).map((item) => item.subject),
		[retained, retained],
	);
	t.assert.strictEqual(
		(
			await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			)
		).length,
		2,
	);

	// the device only the revoked subject ever attached went with it
	t.assert.deepStrictEqual(
		(await unroll(snapshot.staging.devices({ integration: "foo" }))).map(
			(item) => omit(item, "id"),
		),
		[
			{
				integration: "foo",
				manufacturer: device1.manufacturer,
				model: device1.model,
				modelId: device1.model_id,
			},
		],
	);
	t.assert.deepStrictEqual(
		await unroll(snapshot.staging.devices({ integration: "bar" })),
		[],
	);

	// the attached staging is reached through its domain, the connection still holds the
	// generation that was replaced until it is reopened
	await derived.respawn();

	{
		const plan = scheduler.plan(ServiceSchedulerScheduledDeriveSubject.id);
		t.assert.ok(Scheduler.viable(plan));

		await unroll(scheduler.act(plan));
	}

	t.assert.deepStrictEqual(subjects(), [[retained, 1]]);
});
