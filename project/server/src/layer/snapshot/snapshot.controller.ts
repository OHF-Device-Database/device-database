import type { Readable } from "node:stream";

import { Controller, Inject, Optional } from "@nestjs/common";
import { Schema } from "effect";
import { ArrayFormatter } from "effect/ParseResult";

import { logger as parentLogger } from "../../logger";
import { stream } from "../../service/snapshot/stream";
import { Voucher } from "../../service/voucher";
import { isNone, isSome } from "../../type/maybe";
import {
	RequestBodyStream,
	RequestBodyTooLargeError,
	StreamedBody,
} from "../body";
import { ServiceIntrospection } from "../introspection/introspection.service";
import { Route } from "../route";
import { SnapshotDeferTarget } from "./defer/target.interface";
import { ServiceSnapshot } from "./snapshot.service";

import type { IIntrospection } from "../../service/introspect";
import type { SnapshotVoucher } from "../../service/snapshot";
import type { SnapshotRequestTransformOut } from "../../service/snapshot/stream";
import type { Implements } from "../schema";

const logger = parentLogger.child({ label: "controller-snapshot" });

const Parameters = Schema.Struct({
	header: Schema.Struct({
		"user-agent": Schema.String.pipe(Schema.pattern(/^home-assistant\/.+/)),
		"x-device-database-submission-identifier": Schema.optional(Schema.String),
	}),
});
type Parameters = typeof Parameters.Type;

const metrics = (introspection: IIntrospection) =>
	({
		circularDeviceLinks: introspection.metric.counter({
			name: "snapshot_circular_device_link_total",
			help: "amount of circular device links",
			labelNames: ["integration", "version"],
			registry: "local",
		}),
		danglingDeviceLinks: introspection.metric.counter({
			name: "snapshot_dangling_device_link_total",
			help: "amount of dangling device links",
			labelNames: ["integration", "version"],
			registry: "local",
		}),
		emptyDevice: introspection.metric.counter({
			name: "snapshot_empty_device_total",
			help: "amount of empty devices",
			labelNames: ["integration", "version"],
			registry: "local",
		}),
		integrationEntity: introspection.metric.gauge({
			name: "snapshot_integration_entity_total",
			help: "amount of integration entities",
			labelNames: ["integration", "version", "has_devices", "entity_domain"],
			registry: "local",
		}),
		malformedDevice: introspection.metric.counter({
			name: "snapshot_malformed_device_total",
			help: "amount of malformed devices",
			labelNames: ["integration", "version"],
			registry: "local",
		}),
		malformedEntity: introspection.metric.counter({
			name: "snapshot_malformed_entity_total",
			help: "amount of malformed entities",
			labelNames: ["integration", "version"],
			registry: "local",
		}),
		submissionSize: introspection.metric.histogram({
			name: "snapshot_submission_size_bytes",
			help: "size of snapshot submissions",
			labelNames: [],
			registry: "local",
			buckets: [
				1, 2, 5, 11, 26, 58, 131, 296, 668, 1507, 3398, 7662, 17276, 38954,
				87836, 198058, 446593, 1007004, 2270652, 5120000,
			],
		}),
	}) as const;

@Controller()
export class ControllerSnapshot implements Implements<"/api/v1/snapshot/1"> {
	private readonly metrics: ReturnType<typeof metrics>;

	constructor(
		@Inject(ServiceSnapshot) private readonly snapshot: ServiceSnapshot,
		@Optional()
		@Inject(SnapshotDeferTarget)
		private readonly deferTarget: SnapshotDeferTarget | undefined,
		@Inject(ServiceIntrospection) introspection: ServiceIntrospection,
	) {
		this.metrics = metrics(introspection);
	}

	@Route("post", "/api/v1/snapshot/1", { parameters: Parameters })
	@StreamedBody()
	async post(
		parameters: Parameters,
		@RequestBodyStream() requestBody: Readable,
	) {
		const submissionIdentifier =
			parameters.header["x-device-database-submission-identifier"];
		const hassVersion = parameters.header["user-agent"].replace(
			"home-assistant/",
			"",
		);

		let voucher: SnapshotVoucher;
		if (typeof submissionIdentifier !== "undefined") {
			const deserialized =
				this.snapshot.voucher.deserialize(submissionIdentifier);

			if (deserialized.kind === "success") {
				voucher = deserialized.voucher;
			} else {
				switch (deserialized.cause) {
					case "malformed":
						return {
							code: 400,
							contentType: "application/json",
							body: {
								kind: "invalid-submission-identifier",
								message: "invalid submission identifier",
							},
						} as const;
				}
			}
		} else {
			voucher = this.snapshot.voucher.initial();
		}

		const { id, sub } = Voucher.peek(voucher);

		// integrations that contained at least one device
		const integrations: Set<string> = new Set();
		// integration → (domain → count)
		const integrationEntities: Map<string, Map<string, number>> = new Map();

		const chained = stream(requestBody);
		chained.on("device", (item) => {
			if (
				isNone(item.device.entry_type) &&
				isNone(item.device.hw_version) &&
				isNone(item.device.manufacturer) &&
				isNone(item.device.model) &&
				isNone(item.device.model_id) &&
				isNone(item.device.sw_version) &&
				isNone(item.device.via_device)
			) {
				this.metrics.emptyDevice.increment({
					integration: item.integration,
					version: hassVersion,
				});
			}

			integrations.add(item.integration);
		});
		chained.on("entity", (item) => {
			const bucket = integrationEntities.get(item.integration);
			if (typeof bucket === "undefined") {
				integrationEntities.set(
					item.integration,
					new Map([[item.entity.domain, 1]]),
				);
			} else {
				bucket.set(
					item.entity.domain,
					(bucket.get(item.entity.domain) ?? 0) + 1,
				);
			}
		});
		chained.on("end", () => {
			for (const [integration, domainCount] of integrationEntities) {
				const hasDevices = integrations.has(integration);

				for (const [domain, count] of domainCount) {
					this.metrics.integrationEntity.set(
						{
							integration,
							version: hassVersion,
							has_devices: hasDevices ? "true" : "false",
							entity_domain: domain,
						},
						count,
					);
				}
			}
		});
		chained.on("malformed-device", ({ integration, error }) => {
			logger.warn(`submission <${id}> → malformed device`, {
				submissionId: id,
				subject: sub,
				error: ArrayFormatter.formatErrorSync(error),
			});
			this.metrics.malformedDevice.increment({
				integration,
				version: hassVersion,
			});
		});
		chained.on("malformed-entity", ({ integration, error }) => {
			logger.warn(`submission <${id}> → malformed entity`, {
				submissionId: id,
				subject: sub,
				error: ArrayFormatter.formatErrorSync(error),
			});
			this.metrics.malformedEntity.increment({
				integration,
				version: hassVersion,
			});
		});
		chained.on("malformed-link", ({ kind, integration }) => {
			switch (kind) {
				case "circular":
					this.metrics.circularDeviceLinks.increment({
						integration,
						version: hassVersion,
					});
					break;
				case "dangling":
					this.metrics.danglingDeviceLinks.increment({
						integration,
						version: hassVersion,
					});
					break;
			}
		});
		chained.once("size", (s: number) => {
			this.metrics.submissionSize.observe({}, s);
		});

		if (typeof this.deferTarget !== "undefined") {
			await this.deferTarget.put(voucher, hassVersion, chained);
		} else {
			const created = await this.snapshot.create(voucher);
			if (created.kind !== "success") {
				let message;
				switch (created.reason) {
					case "voucher-expired":
						message = "expired submission identifier";
						break;
					case "voucher-used":
						message = "reuse of submission identifier";
						break;
				}

				return {
					code: 400,
					contentType: "application/json",
					body: {
						kind: "invalid-submission-identifier",
						message,
					},
				} as const;
			}

			try {
				for await (const part of chained) {
					const cast = part as SnapshotRequestTransformOut;

					if ("device" in cast) {
						await this.snapshot.attach.device(
							created.handle,
							cast.integration,
							cast.device,
							cast.entities,
						);
					} else {
						await this.snapshot.attach.entity(
							created.handle,
							cast.integration,
							cast.entity,
						);
					}
				}
			} catch (err) {
				await this.snapshot.delete(id);

				// not a malformed submission → left to `InterceptorRouteBody` to answer
				if (err instanceof RequestBodyTooLargeError) {
					throw err;
				}

				logger.warn("stream consumption error", {
					message:
						typeof err === "object" && isSome(err) && "message" in err
							? err.message
							: "unknown error",
				});

				return {
					code: 400,
					contentType: "application/json",
					body: {
						kind: "malformed-submission",
						message: "malformed submission",
					},
				} as const;
			}

			await this.snapshot.finalize(created.handle, chained.hash(), hassVersion);
		}

		return {
			code: 200,
			contentType: "application/json",
			body: {
				submission_identifier: this.snapshot.voucher.serialize(
					this.snapshot.voucher.subsequent(voucher),
				),
			},
		} as const;
	}
}
