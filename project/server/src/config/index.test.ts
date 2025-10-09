import { test } from "tap";

import { configProvider } from ".";

test("config provider", (t) => {
	const config = () =>
		({
			foo: {
				bar: "baz",
			},
			qux: 1,
		}) as const;

	const provider = configProvider(config);

	t.equal(
		provider((c) => c.foo.bar),
		config().foo.bar,
	);
	t.equal(
		provider((c) => c.qux),
		config().qux,
	);

	t.end();
});
