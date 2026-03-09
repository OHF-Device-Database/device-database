import { Readable } from "node:stream";

import { Schema } from "effect";

import { logger as parentLogger } from "../../../logger";
import {
	type SnapshotRequestTransformOut,
	stream,
} from "../../../service/snapshot/stream";
import { Voucher } from "../../../service/voucher";
import { isNone, isSome } from "../../../type/maybe";
import { effectfulSinkEndpoint } from "../../base";

import type { SnapshotVoucher } from "../../../service/snapshot";
import type { Dependency } from "../../dependency";

const logger = parentLogger.child({ label: "snapshot-handler-v1" });

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"user-agent": Schema.String.pipe(Schema.pattern(/^home-assistant\/.+/)),
		"x-device-database-submission-identifier": Schema.optional(Schema.String),
	}),
});

export const postSnapshot1 = (
	d: Pick<Dependency, "snapshot" | "introspection">,
) => {
	const histogram = d.introspection.metric.histogram({
		name: "snapshot_submission_size_bytes",
		help: "size of snapshot submissions",
		labelNames: [],
		buckets: [
			1, 2, 5, 11, 26, 58, 131, 296, 668, 1507, 3398, 7662, 17276, 38954, 87836,
			198058, 446593, 1007004, 2270652, 5120000,
		],
	});

	return effectfulSinkEndpoint(
		"/api/v1/snapshot/1",
		"post",
		Parameters,
		"application/json",
		async (parameters, requestBody) => {
			const submissionIdentifier =
				parameters.header["x-device-database-submission-identifier"];
			const hassVersion = parameters.header["user-agent"].replace(
				"home-assistant/",
				"",
			);

			let voucher: SnapshotVoucher;
			if (typeof submissionIdentifier !== "undefined") {
				const deserialized =
					d.snapshot.self.voucher.deserialize(submissionIdentifier);

				if (deserialized.kind === "success") {
					voucher = deserialized.voucher;
				} else {
					switch (deserialized.cause) {
						case "malformed":
							return {
								code: 400,
								body: {
									kind: "invalid-submission-identifier",
									message: "invalid submission identifier",
								},
							} as const;
					}
				}
			} else {
				voucher = d.snapshot.self.voucher.initial();
			}

			const { id, sub } = Voucher.peek(voucher);

			const chained = stream(Readable.fromWeb(requestBody));
			chained.on("malformed-device", ({ error }) => {
				logger.warn(`submission <${id}> → malformed device`, {
					submissionId: id,
					subject: sub,
					error,
				});
			});
			chained.on("malformed-entity", ({ error }) => {
				logger.warn(`submission <${id}> → malformed entity`, {
					submissionId: id,
					subject: sub,
					error,
				});
			});
			chained.once("size", (s) => {
				histogram.observe([], s);
			});

			if (typeof d.snapshot.deferTarget !== "undefined") {
				await d.snapshot.deferTarget.put(voucher, hassVersion, chained);
			} else {
				const handle = await d.snapshot.self.create(voucher, hassVersion);
				if (isNone(handle)) {
					return {
						code: 400,
						body: {
							kind: "invalid-submission-identifier",
							message: "reuse of expired submission identifier",
						},
					} as const;
				}

				try {
					for await (const part of chained) {
						const cast = part as SnapshotRequestTransformOut;

						if ("device" in cast) {
							await d.snapshot.self.attach.device(
								handle,
								cast.integration,
								cast.device,
								cast.entities,
							);
						} else {
							await d.snapshot.self.attach.entity(
								handle,
								cast.integration,
								cast.entity,
							);
						}
					}
				} catch (err) {
					logger.warn("stream consumption error", {
						message:
							typeof err === "object" && isSome(err) && "message" in err
								? err.message
								: "unknown error",
					});

					await d.snapshot.self.delete(id);

					return {
						code: 400,
						body: {
							kind: "malformed-submission",
							message: "malformed submission",
						},
					} as const;
				}

				await d.snapshot.self.finalize(handle);
			}

			return {
				code: 200,
				body: {
					submission_identifier: d.snapshot.self.voucher.serialize(
						d.snapshot.self.voucher.subsequent(voucher),
					),
				},
			} as const;
		},
	);
};
