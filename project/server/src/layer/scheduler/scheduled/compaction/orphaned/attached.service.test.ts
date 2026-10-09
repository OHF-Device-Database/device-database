import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { logger } from "../../../../../logger";
import { testDatabase } from "../../../../../service/database/utility";
import { StubIntrospection } from "../../../../../service/introspect/stub";
import { Snapshot } from "../../../../../service/snapshot";
import { Voucher } from "../../../../../service/voucher";
import { floor } from "../../../../../type/codec/integer";
import { uuid } from "../../../../../type/codec/uuid";
import { unroll } from "../../../../../utility/iterable";
import { omit } from "../../../../../utility/omit";
import { ServiceSchedulerScheduledCompactionOrphanedAttached } from "./attached.service";

import type { IDatabase } from "../../../../../service/database";

logger.silent = true;

const buildSnapshot = (database: IDatabase<"staging">) =>
	new Snapshot(
		database,
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

test("orphaned attachable", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(database);
	const service = new ServiceSchedulerScheduledCompactionOrphanedAttached(
		database,
	);

	const subjectA = uuid();
	{
		const created = await snapshot.create(snapshot.voucher.initial(subjectA));
		t.assert.strictEqual(created.kind, "success");

		await snapshot.attach.device(created.handle, "foo", device1, [entity1]);
		await snapshot.attach.device(created.handle, "bar", device2, [entity1]);

		await snapshot.finalize(
			created.handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xaa),
			},
			"2025.3.1",
		);
	}

	const subjectB = uuid();
	{
		const created = await snapshot.create(snapshot.voucher.initial(subjectB));
		t.assert.strictEqual(created.kind, "success");

		await snapshot.attach.device(created.handle, "foo", device1, []);

		await snapshot.finalize(
			created.handle,
			{
				version: 1,
				hash: Buffer.alloc(32, 0xab),
			},
			"2025.3.1",
		);
	}

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
		(await unroll(snapshot.staging.devices({ integration: "bar" }))).map(
			(item) => omit(item, "id"),
		),
		[
			{
				integration: "bar",
				manufacturer: device2.manufacturer,
				model: device2.model,
				modelId: device2.model_id,
			},
		],
	);
	t.assert.deepStrictEqual(
		(await unroll(snapshot.staging.entities({ domain: "light" }))).map((item) =>
			omit(item, "id"),
		),
		[
			{
				domain: entity1.domain,
				assumedState: entity1.assumed_state,
				hasName: entity1.has_entity_name,
				category: entity1.entity_category ?? undefined,
				originalDeviceClass: entity1.original_device_class ?? undefined,
				unitOfMeasurement: entity1.unit_of_measurement ?? undefined,
			},
		],
	);

	let attributionA;
	{
		const all = await unroll(
			snapshot.staging.attribution.submissions({ subject: subjectA }),
		);
		t.assert.deepEqual(all.length, 1);
		attributionA = all[0];
	}

	await snapshot.delete(attributionA.submissionId);

	await service.run();

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
	t.assert.deepStrictEqual(
		await unroll(snapshot.staging.entities({ domain: "light" })),
		[],
	);

	let attributionB;
	{
		const all = await unroll(
			snapshot.staging.attribution.submissions({ subject: subjectB }),
		);
		t.assert.deepEqual(all.length, 1);
		attributionB = all[0];
	}
	await snapshot.delete(attributionB.submissionId);

	await service.run();

	t.assert.deepStrictEqual(
		await unroll(snapshot.staging.devices({ integration: "foo" })),
		[],
	);
	t.assert.deepStrictEqual(
		await unroll(snapshot.staging.devices({ integration: "bar" })),
		[],
	);
});
