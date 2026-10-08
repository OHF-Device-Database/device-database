import { type TestContext, test } from "node:test";

import { testDatabase } from "../../../../database/utility";
import { parseCommandTextDatabaseQuery } from "./database-query";
import { build, ctx, errors, texts } from "./utility";

test("/database-query", async (t: TestContext) => {
	await using db = await testDatabase("derived", {
		derived: true,
		staging: true,
	});

	const databases = {
		derived: db,
		staging: db,
	};

	await t.test("parses an action", (t: TestContext) => {
		t.assert.partialDeepStrictEqual(
			parseCommandTextDatabaseQuery("derived plan InsertDerivedDevices"),
			{
				kind: "parsed",
				inner: {
					action: "plan",
					query: {
						name: "InsertDerivedDevices",
						database: "derived",
					},
				},
			},
		);
	});

	await t.test("rejects an unknown database", (t: TestContext) => {
		// the listed names are derived from the allow list, so assert the shape of the
		// listing rather than its contents
		t.assert.match(
			errors(parseCommandTextDatabaseQuery("elsewhere plan Whatever")).join(
				"\n",
			),
			/^unknown database \(known: `\w+`(?:, `\w+`)*\)$/,
		);
		t.assert.match(
			errors(parseCommandTextDatabaseQuery("")).join("\n"),
			/^missing database \(known: `\w+`(?:, `\w+`)*\)$/,
		);
	});

	await t.test("rejects an unknown action", (t: TestContext) => {
		t.assert.deepStrictEqual(
			errors(parseCommandTextDatabaseQuery("derived explain Whatever")),
			["unknown action (known: plan)"],
		);
	});

	await t.test("lists queries when none is named", (t: TestContext) => {
		t.assert.match(
			errors(parseCommandTextDatabaseQuery("derived plan")).join("\n"),
			/^missing query name \(known: `\w+`(?:, `\w+`)*\)$/,
		);
	});

	await t.test(
		"reports a database without debuggable queries",
		(t: TestContext) => {
			t.assert.deepStrictEqual(
				errors(parseCommandTextDatabaseQuery("staging plan")),
				["missing query name (no known queries)"],
			);
		},
	);

	await t.test("reports unavailable databases", async (t: TestContext) => {
		const handled = await build().handle(
			"/database-query",
			"derived plan InsertDerivedDevices",
			ctx,
		);

		t.assert.match(
			texts(handled).join("\n"),
			/^database `\w+` not available 😔$/,
		);
	});

	await t.test(
		"refuses a query outside of the allow list",
		async (t: TestContext) => {
			const handled = await build({ databases }).handle(
				"/database-query",
				"derived plan DeleteDerivedDevices",
				ctx,
			);

			t.assert.match(
				texts(handled)[0] ?? "",
				/^unknown or unsupported query \(known: `\w+`(?:, `\w+`)*\)$/,
			);
		},
	);

	await t.test(
		"refuses a query scoped to another database",
		async (t: TestContext) => {
			const handled = await build({ databases }).handle(
				"/database-query",
				"staging plan InsertDerivedDevices",
				ctx,
			);

			t.assert.deepStrictEqual(texts(handled), [
				"unknown or unsupported query (no known queries)",
			]);
		},
	);

	await t.test("renders a plan", async (t: TestContext) => {
		const handled = await build({ databases }).handle(
			"/database-query",
			"derived plan insertderiveddevices",
			ctx,
		);

		const rendered = texts(handled);

		t.assert.match(
			rendered[0] ?? "",
			/^query plan for \*`\w+`\* on \*`\w+`\* 🔍$/,
		);
		t.assert.ok(rendered.length > 1);
		for (const block of rendered.slice(1)) {
			t.assert.ok(block.startsWith("```\n"));
			t.assert.ok(block.endsWith("```"));
			// section blocks are capped at 3000 characters
			t.assert.ok(block.length <= 3000);
		}
	});
});
