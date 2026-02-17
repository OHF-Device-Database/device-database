import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import { ConfigProvider } from "../../../config";
import { container } from "../../../dependency";
import { IDatabase } from "../../../service/database";
import { IVoucher } from "../../../service/voucher";
import { isNone } from "../../../type/maybe";
import { Query } from "./base";

export const router = () => {
	const router = new Hono();

	const db = container.resolve(IDatabase);
	const snapshotDestination = container.resolve(ConfigProvider)(
		(c) => c.web.database.snapshot.destination,
	);
	const voucher = container.resolve(IVoucher);

	router.get("/", async (c) => {
		if (isNone(snapshotDestination)) {
			return c.text("snapshot destination not configured", 500);
		}

		const decoder = Schema.decodeUnknownEither(Query);
		const decoded = decoder(c.req.query());
		if (isLeft(decoded)) {
			return c.text(decoded.left.message, 400);
		}

		const unpacked = voucher.deserialize(
			decoded.right.voucher,
			"database-snapshot",
			10,
		);
		if (unpacked.kind !== "success") {
			return c.text("invalid voucher", 400);
		}

		const controller = new AbortController();

		await db.snapshot(snapshotDestination);

		const snapshotStream = createReadStream(snapshotDestination, {
			highWaterMark: 16 * 1024,
			signal: controller.signal,
		});

		return stream(c, async (stream) => {
			stream.onAbort(() => {
				controller.abort();
			});

			await stream.pipe(Readable.toWeb(snapshotStream));
		});
	});

	return router;
};
