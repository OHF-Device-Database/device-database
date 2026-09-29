import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { testDatabase } from "../../../../../service/database/utility";
import { StubIntrospection } from "../../../../../service/introspect/stub";
import { Snapshot } from "../../../../../service/snapshot";
import { Voucher } from "../../../../../service/voucher";
import { floor } from "../../../../../type/codec/integer";
import { uuid } from "../../../../../type/codec/uuid";
import { floorTime } from "../../../../../utility/floor-time";
import { unroll } from "../../../../../utility/iterable";
import { ServiceSchedulerScheduledCompactionOrphanedSubmission } from "./submission.service";

import type { IDatabase } from "../../../../../service/database";

const buildSnapshot = (database: IDatabase<"staging">) =>
	new Snapshot(
		database,
		new StubIntrospection(),
		new Voucher(randomBytes(64).toString()),
		{
			voucher: {
				expectedAfter: floor(60 * 60 * 23),
				ttl: floor(60 * 60 * 2),
			},
		},
	);

test("orphaned submission", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(database);

	const service = new ServiceSchedulerScheduledCompactionOrphanedSubmission(
		database,
	);

	t.mock.timers.enable({ apis: ["Date"], now: floorTime() });

	const attributions = [];
	for (let i = 0; i < 2; i++) {
		const subject = uuid();
		const created = await snapshot.create(snapshot.voucher.initial(subject));
		t.assert.strictEqual(created.kind, "success");

		await snapshot.finalize(
			created.handle,
			{ version: 1, hash: randomBytes(32) },
			"2026.5.0",
		);

		let attribution;
		{
			const attributions = await unroll(
				snapshot.staging.attribution.submissions({ subject }),
			);
			t.assert.strictEqual(attributions.length, 1);
			attribution = attributions[0];
		}

		attributions.push(attribution);

		// otherwise submissions share a creation time (which they are ordered by when listed)
		t.mock.timers.tick(1000);
	}

	const [first, second] = attributions;

	t.assert.deepStrictEqual(
		(
			await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			)
		).map((submission) => submission.id),
		[second.submissionId, first.submissionId],
	);

	// no other attribution references the submission, it is orphaned once the attribution is gone
	await snapshot.staging.attribution.delete(second.id);

	await service.run();

	t.assert.deepStrictEqual(
		(
			await unroll(
				snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
			)
		).map((submission) => submission.id),
		[first.submissionId],
	);

	await snapshot.staging.attribution.delete(first.id);

	await service.run();

	t.assert.deepStrictEqual(
		await unroll(
			snapshot.staging.submissions({ a: new Date(0), b: new Date() }),
		),
		[],
	);
});
