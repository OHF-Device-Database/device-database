import { type TestContext, test } from "node:test";

import { Schema } from "effect/index";

import { isSome } from "../../type/maybe";
import { Voucher } from "../voucher";
import { Ingress } from ".";

test("ingress", (t: TestContext) => {
	const voucher = new Voucher("09734462143c5e195c36299bb6892ec2");

	// `DateFromSelf` can't decode tap's mocked dates → use builtin mocking instead
	t.mock.timers.enable({ apis: ["Date"], now: 1760005665000 });

	{
		const ingress = new Ingress({ authority: "foo", secure: true }, voucher);
		t.assert.snapshot(
			ingress.url.databaseSnapshot(
				voucher.create("database-snapshot", new Date()),
			),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		t.assert.snapshot(
			ingress.url.databaseSnapshot(
				voucher.create("database-snapshot", new Date()),
			),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		const url = new URL(
			ingress.url.databaseSnapshot(
				voucher.create("database-snapshot", new Date()),
			),
		);

		const serialized = url.searchParams.get("voucher");
		t.assert.ok(isSome(serialized));

		{
			const deserialized = voucher.deserialize(
				serialized,
				"database-snapshot",
				10,
				Schema.Struct({}),
			);

			t.assert.ok(deserialized.kind === "success");
		}

		t.mock.timers.tick(10 * 1000);

		{
			const deserialized = voucher.deserialize(
				serialized,
				"database-snapshot",
				10,
			);

			t.assert.ok(
				deserialized.kind === "error" && deserialized.cause === "expired",
			);
		}
	}
});
