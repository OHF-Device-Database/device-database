import { type TestContext, test } from "node:test";

import { Voucher } from "../voucher";
import { Ingress } from ".";

test("ingress", (t: TestContext) => {
	const voucher = new Voucher("09734462143c5e195c36299bb6892ec2");

	// `DateFromSelf` can't decode tap's mocked dates → use builtin mocking instead
	t.mock.timers.enable({ apis: ["Date"], now: 1760005665000 });

	{
		const ingress = new Ingress({ authority: "foo", secure: true }, voucher);
		t.assert.snapshot(
			ingress.url.databaseSnapshot(voucher.create("database-snapshot")),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		t.assert.snapshot(
			ingress.url.databaseSnapshot(voucher.create("database-snapshot")),
		);
	}
});
