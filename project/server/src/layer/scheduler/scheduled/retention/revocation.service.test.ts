import { randomBytes } from "node:crypto";
import { type TestContext, test } from "node:test";

import { addSeconds, subDays, subSeconds } from "date-fns";

import { testDatabase } from "../../../../service/database/utility";
import { StubIntrospection } from "../../../../service/introspect/stub";
import { Snapshot } from "../../../../service/snapshot";
import { Voucher } from "../../../../service/voucher";
import { floor } from "../../../../type/codec/integer";
import { uuid } from "../../../../type/codec/uuid";
import { floorTime } from "../../../../utility/floor-time";
import { unroll } from "../../../../utility/iterable";
import { ServiceSchedulerScheduledRetentionRevocation } from "./revocation.service";

import type { IDatabase } from "../../../../service/database";

/** subsequent days without submissions after which a subject is revoked */
const revokeAfter = floor(60);

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

test("revocation", async (t: TestContext) => {
	await using database = await testDatabase("staging", true);

	const snapshot = buildSnapshot(database);

	const now = floorTime();
	t.mock.timers.enable({ apis: ["Date"], now });

	const cutoff = subDays(now, revokeAfter);

	const submissions = [
		// last submitted after the cutoff elapsed
		{ subject: uuid(), at: subSeconds(cutoff, 1) },
		// last submitted just before the cutoff elapsed
		{ subject: uuid(), at: addSeconds(cutoff, 1) },
		// last submitted recently
		{ subject: uuid(), at: now },
	] as const;

	for (const submission of submissions) {
		// attribution is always created with current time, not provided time
		// → mock to use the current time
		t.mock.timers.setTime(submission.at.getTime());

		const created = await snapshot.create(
			snapshot.voucher.initial(submission.subject),
		);
		t.assert.strictEqual(created.kind, "success");

		await snapshot.finalize(
			created.handle,
			{ version: 1, hash: randomBytes(32) },
			"2026.5.0",
		);
	}

	t.mock.timers.reset();

	const [revoked, boundary, recent] = submissions;

	t.assert.deepStrictEqual(
		(
			await unroll(
				snapshot.staging.attribution.submissions({ a: new Date(0), b: now }),
			)
		).map((item) => item.subject),
		[recent, boundary, revoked].map((item) => item.subject),
	);

	const service = new ServiceSchedulerScheduledRetentionRevocation(
		{ snapshot: { revokeAfter } },
		database,
	);

	await service.run();

	t.assert.deepStrictEqual(
		(
			await unroll(
				snapshot.staging.attribution.submissions({ a: new Date(0), b: now }),
			)
		).map((item) => item.subject),
		[recent, boundary].map((item) => item.subject),
	);
});
