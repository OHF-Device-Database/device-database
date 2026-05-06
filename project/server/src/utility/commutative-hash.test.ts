import { type TestContext, test } from "node:test";

import { commutativeHash } from "./commutative-hash";

test("commutative hash", (t: TestContext) => {
	t.test("no steps", (t: TestContext) => {
		const { digest } = commutativeHash("sha256");
		t.assert.deepStrictEqual(
			digest(),
			Buffer.from([
				110, 52, 11, 156, 255, 179, 122, 152, 156, 165, 68, 230, 187, 120, 10,
				44, 120, 144, 29, 63, 179, 55, 56, 118, 133, 17, 163, 6, 23, 175, 160,
				29,
			]),
		);
	});

	t.test("ordering", (t: TestContext) => {
		let a;
		{
			const { update, digest } = commutativeHash("sha256");
			update("foo");
			update("bar");
			update("baz");

			a = digest();
		}

		let b;
		{
			const { update, digest } = commutativeHash("sha256");
			update("bar");
			update("baz");
			update("foo");

			b = digest();
		}

		t.assert.deepStrictEqual(a, b);
	});

	t.test("mismatch", (t: TestContext) => {
		let a;
		{
			const { update, digest } = commutativeHash("sha256");
			update("foo");
			update("bar");
			update("baz");

			a = digest();
		}

		let b;
		{
			const { update, digest } = commutativeHash("sha256");
			update("bar");
			update("baz");

			b = digest();
		}

		t.assert.notDeepStrictEqual(a, b);
	});

	t.test("duplicates", (t: TestContext) => {
		let a;
		{
			const { update, digest } = commutativeHash("sha256");
			update("foo");
			update("foo");
			update("bar");
			update("baz");

			a = digest();
		}

		let b;
		{
			const { update, digest } = commutativeHash("sha256");
			update("foo");
			update("bar");
			update("baz");

			b = digest();
		}

		t.assert.notDeepStrictEqual(a, b);
	});
});
