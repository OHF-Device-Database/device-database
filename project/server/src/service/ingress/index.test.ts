import { type TestContext, test } from "node:test";

import { floor } from "../../type/codec/integer";
import { Ingress } from ".";

test("formats link header style pagination", (t: TestContext) => {
	const ingress = new Ingress({ authority: "example.com", secure: true });

	t.test("first page of multi-page collection", (t: TestContext) => {
		const link = ingress.header.link(
			ingress.relationships("/items", floor(0), floor(10), floor(50)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(2), floor(10), floor(50)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(4), floor(10), floor(50)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(0), floor(10), floor(5)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(10), floor(10), floor(50)),
		);

		t.assert.ok(!link.includes('rel="next"'));
		t.assert.ok(!link.includes('rel="prev"'));
	});

	t.test("includes size in all urls", (t: TestContext) => {
		const link = ingress.header.link(
			ingress.relationships("/items", floor(1), floor(25), floor(100)),
		);

		const urls = [...link.matchAll(/<([^>]+)>/g)].map((m) => new URL(m[1]));
		for (const url of urls) {
			t.assert.strictEqual(url.searchParams.get("size"), "25");
		}
	});

	t.test("start with count not evenly divisible by size", (t: TestContext) => {
		const link = ingress.header.link(
			ingress.relationships("/items", floor(0), floor(10), floor(53)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(3), floor(10), floor(53)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(4), floor(10), floor(53)),
		);

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
		const link = ingress.header.link(
			ingress.relationships("/items", floor(0), floor(10), floor(0)),
		);

		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?size=10>; rel="last"'),
		);
	});

	t.test("preserves search parameters", (t: TestContext) => {
		const link = ingress.header.link(
			ingress.relationships("/items?foo=bar", floor(0), floor(10), floor(0)),
		);

		t.assert.ok(
			link.includes('<https://example.com/items?foo=bar&size=10>; rel="first"'),
		);
		t.assert.ok(
			link.includes('<https://example.com/items?foo=bar&size=10>; rel="last"'),
		);
	});
});
