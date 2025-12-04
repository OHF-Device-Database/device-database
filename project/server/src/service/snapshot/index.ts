import { createType, inject, optional } from "@lppedd/di-wise-neo";
import { addSeconds } from "date-fns";
import { Schema } from "effect";

import { ConfigProvider } from "../../config";
import { logger as parentLogger } from "../../logger";
import { Integer } from "../../type/codec/integer";
import { Uuid, uuid } from "../../type/codec/uuid";
import { isNone, isSome, type Maybe } from "../../type/maybe";
import { IDatabase } from "../database";
import { deleteSnapshot } from "../database/query/snapshot-delete";
import {
	getDeviceBySubmissionId,
	getDeviceCount,
	getDevicePermutationBySubmissionId,
	getDevicePermutationCount,
	getDevicePermutationLinkBySubmissionId,
	getEntityBySubmissionIdAndDevicePermutationId,
	getEntityBySubmissionIdAndIntegration,
	getEntityCount,
	getIntegrationCount,
	getSnapshotByCreatedAtRangeAndCompleted,
	getSnapshotBySubject,
	getSubjectCount,
	getSubmissionCount,
} from "../database/query/snapshot-get";
import {
	getSubmission,
	insertSubmission,
	updateSubmission,
} from "../database/query/snapshot-handle";
import {
	insertAttributionDevice,
	insertAttributionDevicePermutation,
	insertAttributionDevicePermutationLink,
	insertAttributionEntityDevicePermutation,
	insertAttributionEntityIntegration,
	insertDevicePermutationLink,
	insertEntityDevicePermutation,
	insertEntityIntegration,
	upsertDevice,
	upsertDevicePermutation,
	upsertEntity,
} from "../database/query/snapshot-insert";
import { IIntrospection } from "../introspect";
import { IVoucher, type SealedVoucher, Voucher } from "../voucher";

const logger = parentLogger.child({ label: "snapshot" });

type SnapshotHandleContextLink = {
	self: Uuid;
	other: {
		integration: string;
		offset: number;
	};
};
type SnapshotHandleContext = {
	// necessary to establish `via_device` links
	device: {
		// integration → synthesized device identifiers
		identifiers: Map<string, Uuid[]>;
		links: SnapshotHandleContextLink[];
	};
};

const SnapshotSymbol = Symbol("SnapshotSymbol");
export type SnapshotHandle = {
	[SnapshotSymbol]: {
		id: Uuid;
		finalized: boolean;
		held: Promise<void>;
		context: SnapshotHandleContext;
	};
};

const voucherRole = "snapshot-submission" as const;

const SnapshotVoucherPayload = Schema.Struct({
	id: Uuid,
	sub: Uuid,
});
type SnapshotVoucherPayload = typeof SnapshotVoucherPayload.Type;
export type SnapshotVoucher = SealedVoucher<
	typeof voucherRole,
	SnapshotVoucherPayload
>;

type SnapshotVoucherDeserializeResultSuccess = {
	kind: "success";
	voucher: SnapshotVoucher;
};
type SnapshotVoucherDeserializeResultErrorMalformed = {
	kind: "error";
	cause: "malformed";
};
type SnapshotVoucherDeserializeResult =
	| SnapshotVoucherDeserializeResultSuccess
	| SnapshotVoucherDeserializeResultErrorMalformed;

export const SnapshotAttachableEntity = Schema.Struct({
	assumed_state: Schema.Union(Schema.Boolean, Schema.Null),
	domain: Schema.String,
	entity_category: Schema.Union(Schema.String, Schema.Null),
	has_entity_name: Schema.Boolean,
	original_device_class: Schema.Union(Schema.String, Schema.Null),
	unit_of_measurement: Schema.Union(Schema.String, Schema.Null),
});
export type SnapshotAttachableEntity = typeof SnapshotAttachableEntity.Type;

export const SnapshotAttachableDevice = Schema.Struct({
	entry_type: Schema.Union(Schema.String, Schema.Null),
	has_configuration_url: Schema.Boolean,
	hw_version: Schema.Union(Schema.String, Schema.Null),
	manufacturer: Schema.Union(Schema.String, Schema.Null),
	model_id: Schema.Union(Schema.String, Schema.Null),
	model: Schema.Union(Schema.String, Schema.Null),
	sw_version: Schema.Union(Schema.String, Schema.Null),
	via_device: Schema.Union(Schema.Tuple(Schema.String, Integer), Schema.Null),
});
export type SnapshotAttachableDevice = typeof SnapshotAttachableDevice.Type;

let resolved: Promise<void>;
{
	const { promise, resolve } = Promise.withResolvers<void>();
	resolve();
	resolved = promise;
}

type SnapshotSubmission = {
	id: Uuid;
	subject: Uuid;
	createdAt: Date;
	hassVersion: string;
	completedAt?: Date | undefined;
};

type SnapshotEntity = {
	id: Uuid;
	domain: string;
	assumedState?: boolean | undefined;
	hasName: boolean;
	category?: string | undefined;
	originalDeviceClass?: string | undefined;
	unitOfMeasurement?: string | undefined;
};

type SnapshotDevicePermutation = {
	id: Uuid;
	deviceId: Uuid;
	entryType?: string | undefined;
	hasConfigurationUrl?: boolean | undefined;
	versionSw?: string | undefined;
	versionHw?: string | undefined;
};

type SnapshotDevicePermutationLink = {
	id: Uuid;
	parentDevicePermutationId: Uuid;
	childDevicePermutationId: Uuid;
};

type SnapshotDevice = {
	id: Uuid;
	integration?: string | undefined;
	manufacturer?: string | undefined;
	model?: string | undefined;
	modelId?: string | undefined;
};

type PolySubmissionQueryByCreatedBetween = {
	a: Date;
	b: Date;
	complete?: boolean;
};
type PolySubmissionByQuerySubject = {
	subject: Uuid;
};
type PolySubmissionQuery =
	| PolySubmissionQueryByCreatedBetween
	| PolySubmissionByQuerySubject;

type PolyDeviceQueryBySubmissionId = {
	submissionId: Uuid;
};
type PolyDeviceQuery = PolyDeviceQueryBySubmissionId;

type PolyDevicePermutationQueryBySubmissionId = {
	submissionId: Uuid;
};
type PolyDevicePermutationQuery = PolyDevicePermutationQueryBySubmissionId;

type PolyDevicePermutationLinkQueryBySubmissionId = {
	submissionId: Uuid;
};
type PolyDevicePermutationLinkQuery =
	PolyDevicePermutationLinkQueryBySubmissionId;

type PolyEntityQueryBySubmissionIdAndIntegration = {
	submissionId: Uuid;
	integration: string;
};
type PolyEntityQueryBySubmissionIdAndDevicePermutationId = {
	submissionId: Uuid;
	devicePermutationId: Uuid;
};

type PolyEntityQuery =
	| PolyEntityQueryBySubmissionIdAndIntegration
	| PolyEntityQueryBySubmissionIdAndDevicePermutationId;

export interface ISnapshot {
	voucher: {
		initial(subject?: Uuid): SnapshotVoucher;
		subsequent(voucher: SnapshotVoucher): SnapshotVoucher;

		serialize(voucher: SnapshotVoucher): string;
		deserialize(serialized: string): SnapshotVoucherDeserializeResult;

		expired(voucher: SnapshotVoucher): boolean;
	};

	/** does *not* return a handle when an expired voucher is reused */
	create(
		voucher: SnapshotVoucher,
		hassVersion: string,
	): Promise<Maybe<SnapshotHandle>>;
	finalize(handle: SnapshotHandle): Promise<void>;

	/** deletes snapshot descriptor and attributions, but does not clean up potentially orphaned devices */
	delete(id: Uuid): Promise<void>;

	attach: {
		device(
			handle: SnapshotHandle,
			integration: string,
			device: SnapshotAttachableDevice,
			entities: readonly SnapshotAttachableEntity[],
		): Promise<void>;
		entity(
			handle: SnapshotHandle,
			integration: string,
			entity: SnapshotAttachableEntity,
		): Promise<void>;
	};

	staging: {
		/** ordered newest to oldest */
		submissions(query: PolySubmissionQuery): AsyncIterable<SnapshotSubmission>;
		devices(query: PolyDeviceQuery): AsyncIterable<SnapshotDevice>;
		devicePermutations(
			query: PolyDevicePermutationQuery,
		): AsyncIterable<SnapshotDevicePermutation>;
		devicePermutationLinks(
			query: PolyDevicePermutationLinkQuery,
		): AsyncIterable<SnapshotDevicePermutationLink>;
		entities(query: PolyEntityQuery): AsyncIterable<SnapshotEntity>;

		stats: {
			submissions(): Promise<number>;
			devices(): Promise<number>;
			devicePermutations(): Promise<number>;
			entities(): Promise<number>;
			integrations(): Promise<number>;
			subjects(): Promise<number>;
		};
	};
}

export class SnapshotHandleFinalizedError extends Error {
	constructor() {
		super("snapshot handle already finalized");
		Object.setPrototypeOf(this, SnapshotHandleFinalizedError.prototype);
	}
}

export class SnapshotMalformedIdentifierError extends Error {
	constructor(
		public proposed: Uuid,
		public actual: string | undefined,
	) {
		super(
			`encountered malformed identifier <${actual}> while proposing <${proposed}>`,
		);
		Object.setPrototypeOf(this, SnapshotHandleFinalizedError.prototype);
	}
}

export class SnapshotInvalidLinkError extends Error {
	constructor(
		public integration: string,
		public offset: number,
	) {
		super(`invalid link to <${integration}>[${offset}]`);
		Object.setPrototypeOf(this, SnapshotHandleFinalizedError.prototype);
	}
}

export const ISnapshot = createType<ISnapshot>("ISnapshot");

const metrics = (introspection: IIntrospection) =>
	({
		circularyDeviceLinks: introspection.metric.counter({
			name: "snapshot_circular_device_link_total",
			help: "amount of circular device links",
			labelNames: ["integration"],
		}),
		emptyDevice: introspection.metric.counter({
			name: "snapshot_empty_device_total",
			help: "amount of empty devices",
			labelNames: ["integration"],
		}),
	}) as const;

export class Snapshot implements ISnapshot {
	private metrics: ReturnType<typeof metrics> | undefined;

	constructor(
		private database = inject(IDatabase),
		introspection = optional(IIntrospection),
		private voucher_ = inject(IVoucher),
		private configuration = inject(ConfigProvider)((c) => ({
			voucher: {
				expectedAfter: c.snapshot.voucher.expectedAfter,
				ttl: c.snapshot.voucher.ttl,
			},
		})),
	) {
		if (typeof introspection !== "undefined") {
			this.metrics = metrics(introspection);
		}

		introspection?.metric.gauge(
			{
				name: "snapshot_submissions_total",
				help: "amount of submissions",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsSubmissions();
				collector.set({}, value);
			},
		);

		introspection?.metric.gauge(
			{
				name: "snapshot_devices_total",
				help: "amount of devices",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsDevices();
				collector.set({}, value);
			},
		);

		introspection?.metric.gauge(
			{
				name: "snapshot_device_permutations_total",
				help: "amount of device_permutations",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsDevicePermutations();
				collector.set({}, value);
			},
		);

		introspection?.metric.gauge(
			{
				name: "snapshot_entities_total",
				help: "amount of entities",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsEntities();
				collector.set({}, value);
			},
		);

		introspection?.metric.gauge(
			{
				name: "snapshot_integrations_total",
				help: "amount of integrations",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsIntegrations();
				collector.set({}, value);
			},
		);

		introspection?.metric.gauge(
			{
				name: "snapshot_subjects_total",
				help: "amount of subjects",
				labelNames: [],
			},
			async (collector) => {
				const value = await this.stagingStatsSubjects();
				collector.set({}, value);
			},
		);
	}

	private static async acquire(
		handle: SnapshotHandle,
		fn: (
			id: Uuid,
			context: SnapshotHandleContext,
			finalize: () => void,
		) => Promise<void>,
	) {
		const peeked = handle[SnapshotSymbol];
		if (peeked.finalized) {
			throw new SnapshotHandleFinalizedError();
		}

		await peeked.held;

		const { promise, resolve } = Promise.withResolvers<void>();
		peeked.held = promise;

		try {
			await fn(peeked.id, peeked.context, () => {
				peeked.finalized = true;
			});
		} finally {
			resolve();
		}
	}

	private voucherCreate(
		epoch: Date,
		subject?: Uuid,
		id?: Uuid,
	): SnapshotVoucher {
		return this.voucher_.create("snapshot-submission", epoch, {
			id: id ?? uuid(),
			sub: subject ?? uuid(),
		});
	}

	private voucherInitial(subject?: Uuid): SnapshotVoucher {
		return this.voucherCreate(new Date(), subject);
	}

	private voucherSubsequent(voucher: SnapshotVoucher) {
		const { sub } = Voucher.peek(voucher);

		const expectedAt = addSeconds(
			new Date(),
			this.configuration.voucher.expectedAfter,
		);

		return this.voucherCreate(expectedAt, sub);
	}

	private voucherSerialize(voucher: SnapshotVoucher) {
		return this.voucher_.serialize(voucher, SnapshotVoucherPayload);
	}

	private voucherDeserialize(
		serialized: string,
	): SnapshotVoucherDeserializeResult {
		const deserialized = this.voucher_.deserialize(
			serialized,
			voucherRole,
			this.configuration.voucher.ttl,
			SnapshotVoucherPayload,
		);

		switch (deserialized.kind) {
			case "success":
				return { kind: "success", voucher: deserialized.voucher };
			case "error":
				switch (deserialized.cause) {
					case "expired": {
						// extract subject from expired voucher to graft into new voucher that's intentionally expired
						const { id, sub } = Voucher.unwrap(deserialized);
						return {
							kind: "success",
							voucher: this.voucherCreate(deserialized.epoch, sub, id),
						};
					}
					case "malformed":
					case "role-mismatch":
						return { kind: "error", cause: "malformed" };
				}
		}
	}

	private voucherExpired(voucher: SnapshotVoucher): boolean {
		const { at } = Voucher.peek(voucher);

		const earliest = at;
		const latest = addSeconds(at, this.configuration.voucher.ttl);
		const now = new Date();

		return earliest > now || latest < now;
	}

	public voucher = {
		initial: this.voucherInitial.bind(this),
		subsequent: this.voucherSubsequent.bind(this),
		serialize: this.voucherSerialize.bind(this),
		deserialize: this.voucherDeserialize.bind(this),
		expired: this.voucherExpired.bind(this),
	};

	async delete(id: Uuid): Promise<void> {
		this.database.run(deleteSnapshot.bind.named({ submissionId: id }));
	}

	async create(
		voucher: SnapshotVoucher,
		hassVersion: string,
	): Promise<Maybe<SnapshotHandle>> {
		const { id, sub } = Voucher.peek(voucher);

		const created = await this.database.begin("w", async (t) => {
			const existing = await t.run(getSubmission.bind.named({ id }));

			if (isSome(existing)) {
				// do not grant handles for expired vouchers that have already been used
				if (this.voucherExpired(voucher)) {
					return null;
				}

				await this.delete(id);
			}

			return await t.run(
				insertSubmission.bind.named({
					id,
					subject: sub,
					hassVersion,
					createdAt: Math.floor(Date.now() / 1000),
				}),
			);
		});

		const validator = Schema.is(Uuid);
		if (!validator(created?.id)) {
			return null;
		}

		return {
			[SnapshotSymbol]: {
				id: created.id,
				context: {
					device: {
						identifiers: new Map(),
						links: [],
					},
				},
				finalized: false,
				held: resolved,
			},
		};
	}

	async finalize(handle: SnapshotHandle): Promise<void> {
		await Snapshot.acquire(handle, async (submissionId, context, finalize) => {
			await this.database.begin("w", async (t) => {
				for (const link of context.device.links) {
					const parentDevicePermutationId = context.device.identifiers
						.get(link.other.integration)
						?.at(link.other.offset);

					if (typeof parentDevicePermutationId === "undefined") {
						throw new SnapshotInvalidLinkError(
							link.other.integration,
							link.other.offset,
						);
					}

					if (parentDevicePermutationId === link.self) {
						this.metrics?.circularyDeviceLinks.increment({
							integration: link.other.integration,
						});

						logger.warn(
							`encountered circular device reference <${link.other.integration}>[${link.other.offset}], skipping`,
						);
						continue;
					}

					let devicePermutationLinkId = uuid();
					const result = await t.run(
						insertDevicePermutationLink.bind.named({
							id: devicePermutationLinkId,
							parentDevicePermutationId,
							childDevicePermutationId: link.self,
						}),
					);

					const validator = Schema.is(Uuid);
					if (!validator(result?.id)) {
						throw new SnapshotMalformedIdentifierError(
							devicePermutationLinkId,
							result?.id,
						);
					}

					devicePermutationLinkId = result?.id;

					await t.run(
						insertAttributionDevicePermutationLink.bind.named({
							submissionId,
							devicePermutationLinkId,
						}),
					);
				}

				await t.run(
					updateSubmission.bind.named({
						id: submissionId,
						completedAt: Math.floor(Date.now() / 1000),
					}),
				);
			});

			finalize();
		});
	}

	private async attachDevice(
		handle: SnapshotHandle,
		integration: string,
		device: SnapshotAttachableDevice,
		entities: readonly SnapshotAttachableEntity[],
	): Promise<void> {
		await Snapshot.acquire(handle, async (submissionId, context) => {
			let deviceId = uuid();
			let devicePermutationId = uuid();

			if (
				isNone(device.entry_type) &&
				isNone(device.hw_version) &&
				isNone(device.manufacturer) &&
				isNone(device.model) &&
				isNone(device.model_id) &&
				isNone(device.sw_version) &&
				isNone(device.via_device)
			) {
				this.metrics?.emptyDevice.increment({ integration });
			}

			await this.database.begin("w", async (t) => {
				{
					const result = await t.run(
						upsertDevice.bind.named({
							id: deviceId,
							integration,
							manufacturer: device.manufacturer,
							model: device.model,
							modelId: device.model_id,
						}),
					);

					const validator = Schema.is(Uuid);
					if (!validator(result?.id)) {
						throw new SnapshotMalformedIdentifierError(deviceId, result?.id);
					}

					deviceId = result?.id;

					await t.run(
						insertAttributionDevice.bind.named({
							submissionId,
							deviceId,
						}),
					);
				}

				{
					const result = await t.run(
						upsertDevicePermutation.bind.named({
							id: devicePermutationId,
							deviceId,
							entryType: device.entry_type,
							hasConfigurationUrl: device.has_configuration_url ? 1 : 0,
							versionSw: isSome(device.sw_version)
								? JSON.stringify(device.sw_version)
								: null,
							versionHw: isSome(device.hw_version)
								? JSON.stringify(device.hw_version)
								: null,
						}),
					);

					const validator = Schema.is(Uuid);
					if (!validator(result?.id)) {
						throw new SnapshotMalformedIdentifierError(
							devicePermutationId,
							result?.id,
						);
					}

					devicePermutationId = result?.id;

					await t.run(
						insertAttributionDevicePermutation.bind.named({
							submissionId,
							devicePermutationId,
						}),
					);
				}

				for (const entity of entities) {
					let entityId = uuid();
					const result = await t.run(
						upsertEntity.bind.named({
							id: entityId,
							assumedState:
								typeof entity.assumed_state !== "undefined"
									? entity.assumed_state
										? 1
										: 0
									: null,
							domain: entity.domain,
							hasName: entity.has_entity_name ? 1 : 0,
							category: entity.entity_category,
							originalDeviceClass: entity.original_device_class,
							unitOfMeasurement: entity.unit_of_measurement,
						}),
					);

					const validator = Schema.is(Uuid);
					if (!validator(result?.id)) {
						throw new SnapshotMalformedIdentifierError(entityId, result?.id);
					}

					entityId = result?.id;

					{
						let entityDevicePermutationId = uuid();

						const result = await t.run(
							insertEntityDevicePermutation.bind.named({
								id: entityDevicePermutationId,
								entityId,
								devicePermutationId,
							}),
						);

						const validator = Schema.is(Uuid);
						if (!validator(result?.id)) {
							throw new SnapshotMalformedIdentifierError(entityId, result?.id);
						}

						entityDevicePermutationId = result?.id;

						await t.run(
							insertAttributionEntityDevicePermutation.bind.named({
								submissionId,
								entityDevicePermutationId,
							}),
						);
					}
				}
			});

			link: {
				if (isNone(device.via_device)) {
					break link;
				}

				const [integration, offset] = device.via_device;

				context.device.links.push({
					self: devicePermutationId,
					other: {
						integration,
						offset,
					},
				});
			}

			{
				const bucket = context.device.identifiers.get(integration);
				if (typeof bucket === "undefined") {
					context.device.identifiers.set(integration, [devicePermutationId]);
				} else {
					bucket.push(devicePermutationId);
				}
			}
		});
	}

	private async attachEntity(
		handle: SnapshotHandle,
		integration: string,
		entity: SnapshotAttachableEntity,
	): Promise<void> {
		await Snapshot.acquire(handle, async (submissionId) => {
			await this.database.begin("w", async (t) => {
				let entityId = uuid();

				const result = await t.run(
					upsertEntity.bind.named({
						id: entityId,
						assumedState:
							typeof entity.assumed_state !== "undefined"
								? entity.assumed_state
									? 1
									: 0
								: null,
						domain: entity.domain,
						hasName: entity.has_entity_name ? 1 : 0,
						category: entity.entity_category,
						originalDeviceClass: entity.original_device_class,
						unitOfMeasurement: entity.unit_of_measurement,
					}),
				);

				const validator = Schema.is(Uuid);
				if (!validator(result?.id)) {
					throw new SnapshotMalformedIdentifierError(entityId, result?.id);
				}

				entityId = result?.id;

				{
					let entityIntegrationId = uuid();
					const result = await t.run(
						insertEntityIntegration.bind.named({
							id: entityIntegrationId,
							entityId,
							integration,
						}),
					);

					const validator = Schema.is(Uuid);
					if (!validator(result?.id)) {
						throw new SnapshotMalformedIdentifierError(entityId, result?.id);
					}

					entityIntegrationId = result?.id;

					await t.run(
						insertAttributionEntityIntegration.bind.named({
							submissionId,
							entityIntegrationId,
						}),
					);
				}
			});
		});
	}

	attach = {
		device: this.attachDevice.bind(this),
		entity: this.attachEntity.bind(this),
	};

	private async *stagingSubmissions(
		query: PolySubmissionQuery,
	): AsyncIterable<SnapshotSubmission> {
		let bound;
		if ("subject" in query) {
			bound = getSnapshotBySubject.bind.anonymous([query.subject]);
		} else {
			bound = getSnapshotByCreatedAtRangeAndCompleted.bind.named({
				a: Math.floor(query.a.getTime() / 1000),
				b: Math.floor(query.b.getTime() / 1000),
				complete:
					typeof query.complete === "undefined" ? -1 : query.complete ? 1 : 0,
			});
		}

		const validatorId = Schema.is(Uuid);
		const validatorSubject = Schema.is(Uuid);

		for await (const row of this.database.run(bound)) {
			if (!validatorId(row.id)) {
				continue;
			}
			if (!validatorSubject(row.subject)) {
				continue;
			}

			yield {
				id: row.id,
				subject: row.subject,
				createdAt: new Date(row.createdAt * 1000),
				hassVersion: row.hassVersion,
				completedAt: isSome(row.completedAt)
					? new Date(row.completedAt * 1000)
					: undefined,
			};
		}
	}

	private async *stagingDevices(
		query: PolyDeviceQuery,
	): AsyncIterable<SnapshotDevice> {
		const bound = getDeviceBySubmissionId.bind.named({
			submissionId: query.submissionId,
		});

		const validatorId = Schema.is(Uuid);

		for await (const row of this.database.run(bound)) {
			if (!validatorId(row.id)) {
				continue;
			}

			yield {
				id: row.id,
				integration: row.integration,
				manufacturer: row.manufacturer ?? undefined,
				model: row.model ?? undefined,
				modelId: row.modelId ?? undefined,
			};
		}
	}

	private async *stagingDevicePermutations(
		query: PolyDevicePermutationQuery,
	): AsyncIterable<SnapshotDevicePermutation> {
		const bound = getDevicePermutationBySubmissionId.bind.named({
			submissionId: query.submissionId,
		});

		const validatorId = Schema.is(Uuid);
		const validatorDeviceId = Schema.is(Uuid);

		for await (const row of this.database.run(bound)) {
			if (!validatorId(row.id)) {
				continue;
			}

			if (!validatorDeviceId(row.deviceId)) {
				continue;
			}

			yield {
				id: row.id,
				deviceId: row.deviceId,
				entryType: row.entryType ?? undefined,
				hasConfigurationUrl: Boolean(row.hasConfigurationUrl),
				versionSw: row.versionSw ?? undefined,
				versionHw: row.versionHw ?? undefined,
			};
		}
	}

	private async *stagingDevicePermutationLinks(
		query: PolyDevicePermutationLinkQuery,
	): AsyncIterable<SnapshotDevicePermutationLink> {
		const bound = getDevicePermutationLinkBySubmissionId.bind.named({
			submissionId: query.submissionId,
		});

		const validatorId = Schema.is(Uuid);
		const validatorParentDevicePermutationId = Schema.is(Uuid);
		const validatorChildDevicePermutationId = Schema.is(Uuid);

		for await (const row of this.database.run(bound)) {
			if (!validatorId(row.id)) {
				continue;
			}

			if (!validatorParentDevicePermutationId(row.parentDevicePermutationId)) {
				continue;
			}

			if (!validatorChildDevicePermutationId(row.childDevicePermutationId)) {
				continue;
			}

			yield {
				id: row.id,
				parentDevicePermutationId: row.parentDevicePermutationId,
				childDevicePermutationId: row.childDevicePermutationId,
			};
		}
	}

	private async *stagingEntities(
		query: PolyEntityQuery,
	): AsyncIterable<SnapshotEntity> {
		let bound;
		if ("integration" in query) {
			bound = getEntityBySubmissionIdAndIntegration.bind.named({
				integration: query.integration,
				submissionId: query.submissionId,
			});
		} else {
			bound = getEntityBySubmissionIdAndDevicePermutationId.bind.named({
				devicePermutationId: query.devicePermutationId,
				submissionId: query.submissionId,
			});
		}

		const validatorId = Schema.is(Uuid);

		for await (const row of this.database.run(bound)) {
			if (!validatorId(row.id)) {
				continue;
			}

			yield {
				id: row.id,
				domain: row.domain,
				assumedState: isSome(row.assumedState)
					? Boolean(row.assumedState)
					: undefined,
				hasName: Boolean(row.hasName),
				category: row.category ?? undefined,
				originalDeviceClass: row.originalDeviceClass ?? undefined,
				unitOfMeasurement: row.unitOfMeasurement ?? undefined,
			};
		}
	}

	private async stagingStatsSubmissions(): Promise<number> {
		return (
			(
				await this.database.run(
					getSubmissionCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	private async stagingStatsDevices(): Promise<number> {
		return (
			(
				await this.database.run(
					getDeviceCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	private async stagingStatsDevicePermutations(): Promise<number> {
		return (
			(
				await this.database.run(
					getDevicePermutationCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	private async stagingStatsEntities(): Promise<number> {
		return (
			(
				await this.database.run(
					getEntityCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	private async stagingStatsIntegrations(): Promise<number> {
		return (
			(
				await this.database.run(
					getIntegrationCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	private async stagingStatsSubjects(): Promise<number> {
		return (
			(
				await this.database.run(
					getSubjectCount.bind.anonymous([], { rowMode: "tuple" }),
				)
			)?.at(0) ?? 0
		);
	}

	staging = {
		submissions: this.stagingSubmissions.bind(this),
		devices: this.stagingDevices.bind(this),
		devicePermutations: this.stagingDevicePermutations.bind(this),
		devicePermutationLinks: this.stagingDevicePermutationLinks.bind(this),
		entities: this.stagingEntities.bind(this),
		stats: {
			submissions: this.stagingStatsSubmissions.bind(this),
			devices: this.stagingStatsDevices.bind(this),
			devicePermutations: this.stagingStatsDevicePermutations.bind(this),
			entities: this.stagingStatsEntities.bind(this),
			integrations: this.stagingStatsIntegrations.bind(this),
			subjects: this.stagingStatsSubjects.bind(this),
		},
	};
}
