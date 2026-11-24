import { type TestContext, test } from "node:test";

import { logger } from "../../../../logger";
import { ServiceSchedulerScheduledIndexExternalDcl } from "./external-dcl.service";

import type { ServiceIndexExternalDcl } from "../../../index/external/dcl/dcl.service";

logger.silent = true;

const stub = (
	t: TestContext,
	{ configured, available }: { configured: boolean; available: boolean },
) => {
	const sync = t.mock.fn(async () => {});
	const dcl = {
		configured,
		available: async () => available,
		sync,
	} as unknown as ServiceIndexExternalDcl;

	return { dcl, sync };
};

test("scheduled index external dcl", async (t: TestContext) => {
	await t.test("syncs when seeded", async (t: TestContext) => {
		const { dcl, sync } = stub(t, { configured: true, available: true });
		await new ServiceSchedulerScheduledIndexExternalDcl(dcl).run();
		t.assert.strictEqual(sync.mock.callCount(), 1);
	});

	await t.test("skips when not seeded", async (t: TestContext) => {
		const { dcl, sync } = stub(t, { configured: true, available: false });
		await new ServiceSchedulerScheduledIndexExternalDcl(dcl).run();
		t.assert.strictEqual(sync.mock.callCount(), 0);
	});

	await t.test("skips when not configured", async (t: TestContext) => {
		const { dcl, sync } = stub(t, { configured: false, available: true });
		await new ServiceSchedulerScheduledIndexExternalDcl(dcl).run();
		t.assert.strictEqual(sync.mock.callCount(), 0);
	});
});
