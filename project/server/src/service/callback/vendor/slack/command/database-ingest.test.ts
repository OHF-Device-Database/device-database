import { type TestContext, test } from "node:test";

import { parseCommandTextDatabaseIngest } from "./database-ingest";
import { errors } from "./utility";

test("/database-ingest", async (t: TestContext) => {
	await t.test("parses an action", (t: TestContext) => {
		// slack pads text on mobile
		t.assert.deepStrictEqual(parseCommandTextDatabaseIngest(" suspend "), {
			kind: "parsed",
			inner: { action: "suspend" },
		});
		t.assert.deepStrictEqual(parseCommandTextDatabaseIngest("resume"), {
			kind: "parsed",
			inner: { action: "resume" },
		});
	});

	await t.test("rejects an unknown action", (t: TestContext) => {
		t.assert.deepStrictEqual(errors(parseCommandTextDatabaseIngest("")), [
			"unknown action (known: suspend, resume)",
		]);
		t.assert.deepStrictEqual(errors(parseCommandTextDatabaseIngest("halt")), [
			"unknown action (known: suspend, resume)",
		]);
	});
});
