import { Readable } from "node:stream";

import { Hono } from "hono";
import { stream } from "hono/streaming";

import { container } from "../../../dependency";
import { IDatabase } from "../../../service/database";
import { isNone } from "../../../type/maybe";

export const router = () => {
	const router = new Hono();

	const db = container.resolve(IDatabase);

	router.get("/", (c) => {
		const controller = new AbortController();

		const snapshot = db.snapshot(controller.signal);
		if (isNone(snapshot)) {
			return c.text("snapshot unavailable", 500);
		}

		c.header("Cache-Control", `max-age=${60 * 60 * 24}`);

		return stream(c, async (stream) => {
			stream.onAbort(() => {
				controller.abort();
			});

			await stream.pipe(Readable.toWeb(snapshot));
		});
	});

	return router;
};
