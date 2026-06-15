import { type TestContext, test } from "node:test";

import { floor } from "../../type/codec/integer";
import { isSome } from "../../type/maybe";
import { DatabaseSnapshotVoucherPayload } from "../../web/database/snapshot/base";
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
				voucher.create("database-snapshot", new Date(), {
					coordinator: "staging",
				}),
			),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		t.assert.snapshot(
			ingress.url.databaseSnapshot(
				voucher.create("database-snapshot", new Date(), {
					coordinator: "staging",
				}),
			),
		);
	}

	{
		const ingress = new Ingress({ authority: "foo", secure: false }, voucher);
		const url = new URL(
			ingress.url.databaseSnapshot(
				voucher.create("database-snapshot", new Date(), {
					coordinator: "staging",
				}),
			),
		);

		const serialized = url.searchParams.get("voucher");
		t.assert.ok(isSome(serialized));

		{
			const deserialized = voucher.deserialize(
				serialized,
				"database-snapshot",
				10,
				DatabaseSnapshotVoucherPayload,
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

test("formats link header style pagination", (t: TestContext) => {
	const voucher = new Voucher("09734462143c5e195c36299bb6892ec2");
	const ingress = new Ingress(
		{ authority: "example.com", secure: true },
		voucher,
	);

	t.test("first page of multi-page collection", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(0), floor(10), floor(50));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=4&size=10>; rel="last"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=1&size=10>; rel="next"'),
		);
		t.assert.ok(!link.includes('rel="prev"'));
	});

	t.test("middle page includes prev and next", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(2), floor(10), floor(50));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=4&size=10>; rel="last"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=1&size=10>; rel="prev"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=3&size=10>; rel="next"'),
		);
	});

	t.test("last page has no next", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(4), floor(10), floor(50));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=4&size=10>; rel="last"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=3&size=10>; rel="prev"'),
		);
		t.assert.ok(!link.includes('rel="next"'));
	});

	t.test("single page collection has no prev / next", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(0), floor(10), floor(5));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="last"'),
		);
		t.assert.ok(!link.includes('rel="prev"'));
		t.assert.ok(!link.includes('rel="next"'));
	});

	t.test("page beyond end has no prev / next", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(10), floor(10), floor(50));

		t.assert.ok(!link.includes('rel="next"'));
		t.assert.ok(!link.includes('rel="prev"'));
	});

	t.test("includes size in all urls", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(1), floor(25), floor(100));

		const urls = [...link.matchAll(/<([^>]+)>/g)].map((m) => new URL(m[1]));
		for (const url of urls) {
			t.assert.strictEqual(url.searchParams.get("size"), "25");
		}
	});

	t.test("start with count not evenly divisible by size", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(0), floor(10), floor(53));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=5&size=10>; rel="last"'),
		);
		t.assert.ok(!link.includes('rel="prev"'));
		t.assert.ok(
			link.includes('<https://example.com/items?page=1&size=10>; rel="next"'),
		);
	});

	t.test("middle with count not evenly divisible by size", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(3), floor(10), floor(53));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=5&size=10>; rel="last"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=2&size=10>; rel="prev"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=4&size=10>; rel="next"'),
		);
	});

	t.test("last with count not evenly divisible by size", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(4), floor(10), floor(53));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=5&size=10>; rel="last"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?page=3&size=10>; rel="prev"'),
		);
	});

	t.test("empty collection", (t: TestContext) => {
		const link = ingress.header.link("/items", floor(0), floor(10), floor(0));

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="last"'),
		);
	});

	t.test("preserves search parameters", (t: TestContext) => {
		const link = ingress.header.link(
			"/items?foo=bar",
			floor(0),
			floor(10),
			floor(0),
		);

		t.assert.ok(
			link.includes('<https://example.com/items?foo=bar&size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?foo=bar&size=10>; rel="last"'),
		);
	});
});
