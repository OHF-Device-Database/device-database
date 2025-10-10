import { Readable } from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import { container } from "../../dependency";
import { IDatabase } from "../../service/database";
import { IVoucher } from "../../service/voucher";
import { isNone } from "../../type/maybe";
import { Query } from "./base";

export const router = () => {
	const router = new Hono();

	const db = container.resolve(IDatabase);
	const voucher = container.resolve(IVoucher);

	router.get("/", (c) => {
		const decoder = Schema.decodeUnknownEither(Query);
		const decoded = decoder(c.req.query());
		if (isLeft(decoded)) {
			return c.text(decoded.left.message, 400);
		}

		const deserialized = voucher.deserialize(decoded.right.voucher);
		if (isNone(deserialized)) {
			return c.text("malformed voucher", 400);
		}

		if (!voucher.validate(deserialized, "database-snapshot")) {
			return c.text("invalid voucher", 400);
		}

		const controller = new AbortController();

		const backup = db.snapshot(controller.signal);

		if (isNone(backup)) {
			return c.text("backup unavailable", 500);
		}

		return stream(c, async (stream) => {
			stream.onAbort(() => {
				controller.abort();
			});

			await stream.pipe(Readable.toWeb(backup));
		});
	});

	return router;
};
