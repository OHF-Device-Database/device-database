import { mock } from "node:test";

import { test } from "tap";

import { Voucher } from "../voucher";
import { Ingress } from ".";

test("ingress", (t) => {
	const voucher = new Voucher("09734462143c5e195c36299bb6892ec2");

	// `DateFromSelf` can't decode tap's mocked dates → use builtin mocking instead
	mock.timers.enable({ apis: ["Date"], now: 1760005665000 });

	{
		const ingress = new Ingress({ authority: "foo", secure: true }, voucher);
		t.matchSnapshot(
			ingress.url.databaseSnapshot(voucher.create("database-snapshot")),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		t.matchSnapshot(
			ingress.url.databaseSnapshot(voucher.create("database-snapshot")),
		);
	}

	mock.timers.reset();

	t.end();
});
