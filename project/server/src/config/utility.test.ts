import { type TestContext, test } from "node:test";

import { Schema } from "effect/index";

import { floor } from "../type/codec/integer";
import {
	Environment,
	EnvironmentIntegrityError,
	EnvironmentUniteNoopError,
	optional,
	required,
} from "./utility";

const set = (vars: Record<string, string>) => {
	for (const [k, v] of Object.entries(vars)) {
		process.env[k] = v;
	}
};

const cleanup = (t: TestContext) => {
	t.afterEach(() => {
		for (const key of Object.keys(process.env).filter((k) =>
			k.startsWith("TEST_"),
		)) {
			delete process.env[key];
		}
	});
};

test("string", (t) => {
	cleanup(t);

	t.test("required", (t) => {
		t.test("returns value when set", (t: TestContext) => {
			set({ TEST_VAR: "hello" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.string(required("TEST_VAR")), "hello");
		});

		t.test("returns default when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(
				e.string(required("TEST_VAR", "default")),
				"default",
			);
		});

		t.test("throws when unset with no default", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.string(required("TEST_VAR")),
				EnvironmentIntegrityError,
			);
		});
	});

	t.test("optional", (t) => {
		t.test("returns value when set", (t: TestContext) => {
			set({ TEST_VAR: "world" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.string(optional("TEST_VAR")), "world");
		});

		t.test("returns null when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.string(optional("TEST_VAR")), null);
		});
	});
});

test("integer", (t) => {
	cleanup(t);

	t.test("required", (t) => {
		t.test("returns parsed integer", (t: TestContext) => {
			set({ TEST_INT: "42" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.integer(required("TEST_INT")), 42);
		});

		t.test("returns default when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.integer(required("TEST_INT", floor(10))), 10);
		});

		t.test("throws on non-integer value", (t: TestContext) => {
			set({ TEST_INT: "abc" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.integer(required("TEST_INT")),
				EnvironmentIntegrityError,
			);
		});

		t.test("throws when unset with no default", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.integer(required("TEST_INT")),
				EnvironmentIntegrityError,
			);
		});

		t.test("throws on floating point value", (t: TestContext) => {
			set({ TEST_INT: "3.14" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.integer(required("TEST_INT")),
				EnvironmentIntegrityError,
			);
		});
	});

	t.test("optional", (t) => {
		t.test("returns parsed integer when set", (t: TestContext) => {
			set({ TEST_INT: "99" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.integer(optional("TEST_INT")), 99);
		});

		t.test("returns null when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.integer(optional("TEST_INT")), null);
		});

		t.test("throws on floating point value", (t: TestContext) => {
			set({ TEST_INT: "3.14" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.integer(optional("TEST_INT")),
				EnvironmentIntegrityError,
			);
		});
	});
});

test("boolean", (t) => {
	cleanup(t);

	t.test("required", (t) => {
		t.test("returns true", (t: TestContext) => {
			set({ TEST_BOOL: "true" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.boolean(required("TEST_BOOL")), true);
		});

		t.test("returns false", (t: TestContext) => {
			set({ TEST_BOOL: "false" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.boolean(required("TEST_BOOL")), false);
		});

		t.test("throws on invalid value", (t: TestContext) => {
			set({ TEST_BOOL: "yes" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.boolean(required("TEST_BOOL")),
				EnvironmentIntegrityError,
			);
		});

		t.test("throws when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.boolean(required("TEST_BOOL")),
				EnvironmentIntegrityError,
			);
		});
	});

	t.test("optional", (t) => {
		t.test("returns null when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.boolean(optional("TEST_BOOL")), null);
		});
	});
});

test("buffer", (t) => {
	cleanup(t);

	const encoded = Buffer.from("hello").toString("base64");

	t.test("required", (t) => {
		t.test("decodes base64", (t: TestContext) => {
			set({ TEST_BUF: encoded });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(
				e.buffer(required("TEST_BUF")),
				Buffer.from("hello"),
			);
		});

		t.test(
			"throws on malformed base64 (non-empty but decodes empty)",
			(t: TestContext) => {
				set({ TEST_BUF: "!!!" });
				const e = new Environment({ exit: false });
				t.assert.throws(
					() => e.buffer(required("TEST_BUF")),
					EnvironmentIntegrityError,
				);
			},
		);

		t.test("throws when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.buffer(required("TEST_BUF")),
				EnvironmentIntegrityError,
			);
		});
	});

	t.test("optional", (t) => {
		t.test("returns null when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.buffer(optional("TEST_BUF")), null);
		});
	});
});

test("choice", (t) => {
	cleanup(t);

	const Color = Schema.Enums({ Red: "red", Blue: "blue" } as const);

	t.test("required", (t) => {
		t.test("returns valid choice", (t: TestContext) => {
			set({ TEST_CHOICE: "red" });
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.choice(Color)(required("TEST_CHOICE")), "red");
		});

		t.test("throws on invalid choice", (t: TestContext) => {
			set({ TEST_CHOICE: "green" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.choice(Color)(required("TEST_CHOICE")),
				EnvironmentIntegrityError,
			);
		});
	});

	t.test("optional", (t) => {
		t.test("returns null when unset", (t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.deepStrictEqual(e.choice(Color)(optional("TEST_CHOICE")), null);
		});
	});
});

test("unite", (t) => {
	cleanup(t);

	t.test("returns result when all required vars are set", (t: TestContext) => {
		set({ TEST_DB_HOST: "localhost", TEST_DB_PORT: "5432" });
		const e = new Environment({ exit: false });
		const result = e.unite("TEST_DB", (env) => ({
			host: env.string(required("HOST")),
			port: env.integer(required("PORT")),
		}));
		t.assert.deepStrictEqual(result, { host: "localhost", port: 5432 });
	});

	t.test("returns null when no vars are set", (t: TestContext) => {
		const e = new Environment({ exit: false });
		const result = e.unite("TEST_DB", (env) => ({
			host: env.string(required("HOST")),
			port: env.integer(required("PORT")),
		}));
		t.assert.deepStrictEqual(result, null);
	});

	t.test("throws when var contains faulty value", (t: TestContext) => {
		set({ TEST_DB_HOST: "localhost", TEST_DB_PORT: "foo" });
		const e = new Environment({ exit: false });
		t.assert.throws(
			() =>
				e.unite("TEST_DB", (env) => ({
					host: env.string(required("HOST")),
					port: env.integer(required("PORT")),
				})),
			EnvironmentIntegrityError,
		);
	});

	t.test(
		"throws when scope consists exclusively of required vars that have defaults",
		(t: TestContext) => {
			const e = new Environment({ exit: false });
			t.assert.throws(
				() =>
					e.unite("TEST_DB", (env) => ({
						host: env.string(required("HOST", "localhost")),
					})),
				EnvironmentUniteNoopError,
			);
		},
	);

	t.test("nesting", (t: TestContext) => {
		t.test(
			"returns result when all nested required vars are set",
			(t: TestContext) => {
				set({ TEST_OUTER_DB_HOST: "nested-host", TEST_OUTER_DB_PORT: "1234" });
				const e = new Environment({ exit: false });
				const result = e.unite("TEST_OUTER", (env) =>
					env.unite("DB", (inner) => ({
						host: inner.string(required("HOST")),
						port: inner.integer(required("PORT")),
					})),
				);
				t.assert.deepStrictEqual(result, {
					host: "nested-host",
					port: 1234,
				});
			},
		);

		t.test(
			"returns null when nested required var is absent",
			(t: TestContext) => {
				set({ TEST_OUTER_DB_HOST: "nested-host" });
				const e = new Environment({ exit: false });
				const result = e.unite("TEST_OUTER", (env) =>
					env.unite("DB", (inner) => ({
						host: inner.string(required("HOST")),
						port: inner.integer(required("PORT")),
					})),
				);
				t.assert.deepStrictEqual(result, null);
			},
		);
	});
});

test("many", (t) => {
	cleanup(t);

	t.test("returns empty array when no vars are set", (t: TestContext) => {
		const e = new Environment({ exit: false });
		const result = e.many((env) => env.string(required("TEST_ITEM")));
		t.assert.deepStrictEqual(result, []);
	});

	t.test("returns single item (no postfix)", (t: TestContext) => {
		set({ TEST_ITEM: "first" });
		const e = new Environment({ exit: false });
		const result = e.many((env) => env.string(required("TEST_ITEM")));
		t.assert.deepStrictEqual(result, ["first"]);
	});

	t.test("collects items with numbered postfixes", (t: TestContext) => {
		set({ TEST_ITEM: "first", TEST_ITEM_1: "second", TEST_ITEM_2: "third" });
		const e = new Environment({ exit: false });
		const result = e.many((env) => env.string(required("TEST_ITEM")));
		t.assert.deepStrictEqual(result, ["first", "second", "third"]);
	});

	t.test("stops at first gap in postfix sequence", (t: TestContext) => {
		set({ TEST_ITEM: "first", TEST_ITEM_2: "third" });
		const e = new Environment({ exit: false });
		const result = e.many((env) => env.string(required("TEST_ITEM")));
		t.assert.deepStrictEqual(result, ["first"]);
	});

	t.test(
		"throws on a faulty variable within the sequence",
		(t: TestContext) => {
			set({ TEST_ITEM: "42", TEST_ITEM_1: "not-a-number" });
			const e = new Environment({ exit: false });
			t.assert.throws(
				() => e.many((env) => env.integer(required("TEST_ITEM"))),
				EnvironmentIntegrityError,
			);
		},
	);

	t.test("nesting", (t: TestContext) => {
		t.test("unite within many - returns multiple united", (t: TestContext) => {
			set({
				TEST_SERVER_HOST: "host-a",
				TEST_SERVER_PORT: "8080",
				TEST_SERVER_HOST_1: "host-b",
				TEST_SERVER_PORT_1: "9090",
			});
			const e = new Environment({ exit: false });
			const result = e.many((env) =>
				env.unite("TEST_SERVER", (inner) => ({
					host: inner.string(required("HOST")),
					port: inner.integer(required("PORT")),
				})),
			);
			t.assert.deepStrictEqual(result, [
				{
					host: "host-a",
					port: 8080,
				},
				{
					host: "host-b",
					port: 9090,
				},
			]);
		});

		t.test(
			"unite within many — empty result when no vars set",
			(t: TestContext) => {
				const e = new Environment({ exit: false });
				const result = e.many((env) =>
					env.unite("TEST_SERVER", (inner) => ({
						host: inner.string(required("HOST")),
						port: inner.integer(required("PORT")),
					})),
				);
				t.assert.deepStrictEqual(result, []);
			},
		);

		t.test(
			"many within unite - returns result when vars are set",
			(t: TestContext) => {
				set({ TEST_GROUP_ITEM: "a", TEST_GROUP_ITEM_1: "b" });
				const e = new Environment({ exit: false });
				const result = e.unite("TEST_GROUP", (env) =>
					env.many((inner) => inner.string(required("ITEM"))),
				);
				t.assert.deepStrictEqual(result, ["a", "b"]);
			},
		);

		t.test(
			"many within unite - returns empty array when no vars are set",
			(t: TestContext) => {
				const e = new Environment({ exit: false });
				const result = e.unite("TEST_GROUP", (env) =>
					env.many((inner) => inner.string(required("ITEM"))),
				);
				t.assert.deepStrictEqual(result, []);
			},
		);
	});
});
