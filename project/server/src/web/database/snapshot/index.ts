import { Readable } from "node:stream";

import { Schema } from "effect";
import { isLeft } from "effect/Either";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import { container } from "../../../dependency";
import { DatabaseSnapshotCoordinators } from "../../../service/database/snapshot-coordinator/base";
import { IVoucher, Voucher } from "../../../service/voucher";
import { isNone } from "../../../type/maybe";
import { DatabaseSnapshotVoucherPayload, Query } from "./base";

export const router = () => {
	const router = new Hono();

	const coordinators = container.resolve(DatabaseSnapshotCoordinators);

	const voucher = container.resolve(IVoucher);

	router.get("/", async (c) => {
		const decoder = Schema.decodeUnknownEither(Query);
		const decoded = decoder(c.req.query());
		if (isLeft(decoded)) {
			return c.text(decoded.left.message, 400);
		}

		const unpacked = voucher.deserialize(
			decoded.right.voucher,
			"database-snapshot",
			10,
			DatabaseSnapshotVoucherPayload,
		);
		if (unpacked.kind !== "success") {
			return c.text("invalid voucher", 400);
		}

		const peeked = Voucher.peek(unpacked.voucher);

		const coordinator = coordinators[peeked.coordinator];
		if (typeof coordinator === "undefined") {
			return c.text("snapshot coordinator not configured", 500);
		}

		const handle = await coordinator.stale();
		if (isNone(handle)) {
			return c.text("snapshot became unexpectedly unavailable", 500);
		}

		const controller = new AbortController();

		const snapshotStream = handle.createReadStream({
			highWaterMark: 16 * 1024,
			signal: controller.signal,
		});

		return stream(c, async (stream) => {
			// `stream.onAbort` doesn't appear to work 🫠
			// https://g ithub.com/honojs/hono/issues/1770
			c.req.raw.signal.addEventListener("abort", () => {
				controller.abort();
			});

			await stream.pipe(Readable.toWeb(snapshotStream));
		});
	});

	return router;
};
