import { type TestContext, test } from "node:test";

import { configProvider } from ".";

test("config provider", (t: TestContext) => {
	const config = () =>
		({
			foo: {
				bar: "baz",
			},
			qux: 1,
		}) as const;

	const provider = configProvider(config);

	t.assert.strictEqual(
		provider((c) => c.foo.bar),
		config().foo.bar,
	);
	t.assert.strictEqual(
		provider((c) => c.qux),
		config().qux,
	);
});
