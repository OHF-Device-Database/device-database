import { Readable } from "node:stream";
import { type TestContext, test } from "node:test";

import { BadRequestException } from "@nestjs/common";

import { logger } from "../../logger";
import { Voucher } from "../../service/voucher";
import { floor } from "../../type/codec/integer";
import { RequestBodyTooLargeError } from "../body";
import { invoke } from "../test";
import { ControllerSnapshot } from "./snapshot.controller";

import type {
	SnapshotAttachableDevice,
	SnapshotAttachableEntity,
	SnapshotCreateResult,
	SnapshotHandleAttachableUnhashed,
	SnapshotHash,
	SnapshotVoucher,
} from "../../service/snapshot";
import type { Uuid } from "../../type/codec/uuid";
import type { ServiceIntrospection } from "../introspection/introspection.service";
import type { RequestStreamStub } from "../test";
import type { SnapshotDeferTarget } from "./defer/target.interface";
import type { ServiceSnapshot } from "./snapshot.service";

logger.silent = true;

const SIGNING_KEY = "voucher-signing-key";
const SUBJECT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301" as Uuid;
const INITIAL = "3f2504e0-4f89-11d3-9a0c-0305e82c3302" as Uuid;
const RESUMED = "3f2504e0-4f89-11d3-9a0c-0305e82c3303" as Uuid;
const SUBSEQUENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3304" as Uuid;

const MALFORMED_IDENTIFIER = "not-a-voucher";
const USER_AGENT = "home-assistant/2024.1.0";
const VERSION = "2024.1.0";

const HANDLE = {} as SnapshotHandleAttachableUnhashed;

const sealed = (id: Uuid): SnapshotVoucher =>
	new Voucher(SIGNING_KEY).create("snapshot-submission", new Date(0), {
		id,
		sub: SUBJECT,
		seq: floor(0),
	});

type Attached =
	| {
			kind: "device";
			integration: string;
			device: SnapshotAttachableDevice;
			entities: readonly SnapshotAttachableEntity[];
	  }
	| { kind: "entity"; integration: string; entity: SnapshotAttachableEntity };

type Finalized = {
	handle: unknown;
	hash: SnapshotHash;
	hassVersion: string;
};

class StubSnapshot {
	created: SnapshotCreateResult<SnapshotHandleAttachableUnhashed> = {
		kind: "success",
		handle: HANDLE,
	};

	constructor(private accepted: boolean) {}

	readonly attached: Attached[] = [];
	readonly finalized: Finalized[] = [];
	readonly deleted: Uuid[] = [];
	/** identifiers of the vouchers a successor was derived from */
	readonly renewed: Uuid[] = [];

	readonly voucher = {
		initial: () => sealed(INITIAL),
		subsequent: (voucher: SnapshotVoucher) => {
			this.renewed.push(Voucher.peek(voucher).id);
			return sealed(SUBSEQUENT);
		},
		serialize: (voucher: SnapshotVoucher) =>
			`voucher:${Voucher.peek(voucher).id}`,
		deserialize: (serialized: string) =>
			serialized === MALFORMED_IDENTIFIER
				? ({ kind: "error", cause: "malformed" } as const)
				: ({ kind: "success", voucher: sealed(RESUMED) } as const),
		expired: () => false,
		expiresAt: () => new Date(0),
		accept: () => this.accepted,
	};

	readonly attach = {
		device: async (
			_: unknown,
			integration: string,
			device: SnapshotAttachableDevice,
			entities: readonly SnapshotAttachableEntity[],
		) => {
			this.attached.push({ kind: "device", integration, device, entities });
		},
		entity: async (
			_: unknown,
			integration: string,
			entity: SnapshotAttachableEntity,
		) => {
			this.attached.push({ kind: "entity", integration, entity });
		},
	};

	async create() {
		return this.created;
	}

	async delete(id: Uuid) {
		this.deleted.push(id);
	}

	async finalize(handle: unknown, hash: SnapshotHash, hassVersion: string) {
		this.finalized.push({ handle, hash, hassVersion });
	}
}

type Observation = {
	name: string;
	labels: Readonly<Record<string, string | number>>;
	value: number;
};

const introspection = (observed: Observation[]): ServiceIntrospection => {
	const metric = (name: string) => ({
		increment: (labels: Observation["labels"], by = 1) => {
			observed.push({ name, labels, value: by });
		},
		set: (labels: Observation["labels"], value: number) => {
			observed.push({ name, labels, value });
		},
		observe: (labels: Observation["labels"], value: number) => {
			observed.push({ name, labels, value });
		},
	});

	return {
		metric: {
			counter: ({ name }: { name: string }) => metric(name),
			gauge: ({ name }: { name: string }) => metric(name),
			histogram: ({ name }: { name: string }) => metric(name),
		},
	} as unknown as ServiceIntrospection;
};

type Deferred = {
	id: Uuid;
	hassVersion: string;
	parts: number;
};

const deferTarget = (received: Deferred[]): SnapshotDeferTarget =>
	({
		put: async (
			voucher: SnapshotVoucher,
			hassVersion: string,
			snapshot: AsyncIterable<unknown>,
		) => {
			let parts = 0;
			for await (const _ of snapshot) {
				parts += 1;
			}

			received.push({ id: Voucher.peek(voucher).id, hassVersion, parts });
		},
	}) as unknown as SnapshotDeferTarget;

type Context = {
	controller: ControllerSnapshot;
	snapshot: StubSnapshot;
	observed: Observation[];
	deferred: Deferred[];
};

const context = (defer = false, accept = true): Context => {
	const snapshot = new StubSnapshot(accept);
	const observed: Observation[] = [];
	const deferred: Deferred[] = [];

	return {
		snapshot,
		observed,
		deferred,
		controller: new ControllerSnapshot(
			snapshot as unknown as ServiceSnapshot,
			defer ? deferTarget(deferred) : undefined,
			introspection(observed),
		),
	};
};

const request = (
	body: unknown,
	headers: Readonly<Record<string, string>> = { "user-agent": USER_AGENT },
): RequestStreamStub =>
	Object.assign(
		Readable.from([typeof body === "string" ? body : JSON.stringify(body)]),
		{ headers },
	) as RequestStreamStub;

const post = async (
	{ controller }: Context,
	stub: RequestStreamStub,
): Promise<unknown> => await invoke(controller, "post", stub);

const ENTITY: SnapshotAttachableEntity = {
	assumed_state: null,
	domain: "light",
	entity_category: null,
	has_entity_name: false,
	original_device_class: null,
	unit_of_measurement: null,
};

const DEVICE: SnapshotAttachableDevice = {
	entry_type: null,
	has_configuration_url: false,
	hw_version: null,
	manufacturer: "Philips",
	model: "Hue Go",
	model_id: null,
	sw_version: null,
	via_device: null,
};

const EMPTY_DEVICE: SnapshotAttachableDevice = {
	...DEVICE,
	manufacturer: null,
	model: null,
};

test("initial submission", async (t: TestContext) => {
	const c = context();

	const response = await post(
		c,
		request({
			hue: {
				devices: [{ ...DEVICE, entities: [ENTITY] }],
				entities: [ENTITY],
			},
		}),
	);

	await t.test("starts a new attribution chain", (t: TestContext) => {
		t.assert.deepStrictEqual(c.snapshot.renewed, [INITIAL]);
	});

	await t.test("attaches what the body declared", (t: TestContext) => {
		t.assert.deepStrictEqual(c.snapshot.attached, [
			{
				kind: "device",
				integration: "hue",
				device: DEVICE,
				entities: [ENTITY],
			},
			{ kind: "entity", integration: "hue", entity: ENTITY },
		]);
	});

	await t.test("finalizes with the version it was told", (t: TestContext) => {
		t.assert.strictEqual(c.snapshot.finalized.length, 1);

		const [finalized] = c.snapshot.finalized;
		t.assert.strictEqual(finalized?.handle, HANDLE);
		t.assert.strictEqual(finalized?.hassVersion, VERSION);
		t.assert.strictEqual(finalized?.hash.version, 1);
		t.assert.ok(Buffer.isBuffer(finalized?.hash.hash));
	});

	await t.test("hands back the successor", (t: TestContext) => {
		t.assert.deepStrictEqual(response, {
			code: 200,
			contentType: "application/json",
			body: { submission_identifier: `voucher:${SUBSEQUENT}` },
		});
	});

	await t.test("measures what it received", (t: TestContext) => {
		const size = c.observed.filter(
			({ name }) => name === "snapshot_submission_size_bytes",
		);

		t.assert.strictEqual(size.length, 1);
		t.assert.ok((size[0]?.value ?? 0) > 0);
	});
});

test("subsequent submission", async (t: TestContext) => {
	await t.test("continues that attribution chain", async (t: TestContext) => {
		const c = context();

		const response = await post(
			c,
			request(
				{ hue: { devices: [], entities: [] } },
				{
					"user-agent": USER_AGENT,
					"x-device-database-submission-identifier": "previous",
				},
			),
		);

		t.assert.deepStrictEqual(c.snapshot.renewed, [RESUMED]);
		t.assert.deepStrictEqual(response, {
			code: 200,
			contentType: "application/json",
			body: { submission_identifier: `voucher:${SUBSEQUENT}` },
		});
	});

	await t.test("is rejected when it is malformed", async (t: TestContext) => {
		const c = context();

		const response = await post(
			c,
			request(
				{ hue: { devices: [], entities: [] } },
				{
					"user-agent": USER_AGENT,
					"x-device-database-submission-identifier": MALFORMED_IDENTIFIER,
				},
			),
		);

		t.assert.deepStrictEqual(response, {
			code: 400,
			contentType: "application/json",
			body: {
				kind: "invalid-submission-identifier",
				message: "invalid submission identifier",
			},
		});
		t.assert.deepStrictEqual(c.snapshot.attached, []);
		t.assert.deepStrictEqual(c.snapshot.finalized, []);
	});
});

test("submission with invalid identifier", async (t: TestContext) => {
	const cases = [
		["voucher-expired", "expired submission identifier"],
		["voucher-used", "reuse of submission identifier"],
	] as const;

	for (const [reason, message] of cases) {
		await t.test(`is rejected as ${reason}`, async (t: TestContext) => {
			const c = context();
			c.snapshot.created = { kind: "failure", reason };

			t.assert.deepStrictEqual(
				await post(c, request({ hue: { devices: [DEVICE], entities: [] } })),
				{
					code: 400,
					contentType: "application/json",
					body: { kind: "invalid-submission-identifier", message },
				},
			);
			t.assert.deepStrictEqual(c.snapshot.attached, []);
			t.assert.deepStrictEqual(c.snapshot.finalized, []);
			t.assert.deepStrictEqual(c.snapshot.deleted, []);
		});
	}
});

test("submission only ingested when accepted", async (t: TestContext) => {
	const submit = async (accept: boolean, defer = false) => {
		const c = context(defer, accept);

		const response = await post(
			c,
			request({
				hue: {
					devices: [{ ...DEVICE, entities: [ENTITY] }],
					entities: [ENTITY],
				},
			}),
		);

		return { c, response };
	};

	const ok = {
		code: 200,
		contentType: "application/json",
		body: { submission_identifier: `voucher:${SUBSEQUENT}` },
	};

	await t.test(
		"immediate ingestion happens when accepting",
		async (t: TestContext) => {
			const { c, response } = await submit(true);

			t.assert.deepStrictEqual(c.snapshot.attached, [
				{
					kind: "device",
					integration: "hue",
					device: DEVICE,
					entities: [ENTITY],
				},
				{ kind: "entity", integration: "hue", entity: ENTITY },
			]);
			t.assert.strictEqual(c.snapshot.finalized.length, 1);
			t.assert.deepStrictEqual(response, ok);
		},
	);

	await t.test(
		"no immediate ingestion happens when not accepting",
		async (t: TestContext) => {
			const { c, response } = await submit(false);

			t.assert.deepStrictEqual(c.snapshot.attached, []);
			t.assert.deepStrictEqual(c.snapshot.finalized, []);
			t.assert.deepStrictEqual(c.snapshot.deleted, []);

			// the chain carries on all the same
			t.assert.deepStrictEqual(c.snapshot.renewed, [INITIAL]);
			t.assert.deepStrictEqual(response, ok);
		},
	);

	await t.test(
		"deferred ingestion happens when accepting",
		async (t: TestContext) => {
			const { c, response } = await submit(true, true);

			t.assert.deepStrictEqual(c.deferred, [
				{ id: INITIAL, hassVersion: VERSION, parts: 2 },
			]);
			t.assert.deepStrictEqual(response, ok);
		},
	);

	await t.test(
		"no deferred ingestion happens when not accepting",
		async (t: TestContext) => {
			const { c, response } = await submit(false, true);

			t.assert.deepStrictEqual(c.deferred, []);
			t.assert.deepStrictEqual(response, ok);
		},
	);
});

test("unreadable submission", async (t: TestContext) => {
	const c = context();

	const response = await post(c, request('{"hue": {"devices": ['));

	await t.test("is answered as malformed", (t: TestContext) => {
		t.assert.deepStrictEqual(response, {
			code: 400,
			contentType: "application/json",
			body: { kind: "malformed-submission", message: "malformed submission" },
		});
	});

	await t.test("leaves nothing behind", (t: TestContext) => {
		t.assert.deepStrictEqual(c.snapshot.deleted, [INITIAL]);
		t.assert.deepStrictEqual(c.snapshot.finalized, []);
	});
});

test("oversized submission", async (t: TestContext) => {
	const c = context();

	// `@StreamedBody` caps at `REQUEST_BODY_LIMIT`, so the body has to pass it
	const devices = Array.from({ length: 40_000 }, () => DEVICE);

	await t.test(
		"is left for the interceptor to answer",
		async (t: TestContext) => {
			await t.assert.rejects(
				async () => await post(c, request({ hue: { devices, entities: [] } })),
				(error: unknown) => error instanceof RequestBodyTooLargeError,
			);
		},
	);

	await t.test("is cleaned up all the same", (t: TestContext) => {
		t.assert.deepStrictEqual(c.snapshot.deleted, [INITIAL]);
		t.assert.deepStrictEqual(c.snapshot.finalized, []);
	});
});

test("deferred submission", async (t: TestContext) => {
	const c = context(true);

	const response = await post(
		c,
		request({
			hue: {
				devices: [{ ...DEVICE, entities: [] }],
				entities: [ENTITY],
			},
		}),
	);

	await t.test("is handed to the target whole", (t: TestContext) => {
		t.assert.deepStrictEqual(c.deferred, [
			{ id: INITIAL, hassVersion: VERSION, parts: 2 },
		]);
	});

	await t.test("is not ingested directly", (t: TestContext) => {
		t.assert.deepStrictEqual(c.snapshot.attached, []);
		t.assert.deepStrictEqual(c.snapshot.finalized, []);
	});

	await t.test("is acknowledged all the same", (t: TestContext) => {
		t.assert.deepStrictEqual(response, {
			code: 200,
			contentType: "application/json",
			body: { submission_identifier: `voucher:${SUBSEQUENT}` },
		});
	});
});

test("what a submission is measured by", async (t: TestContext) => {
	const c = context();

	await post(
		c,
		request({
			hue: {
				devices: [
					// links to itself
					{ ...DEVICE, via_device: ["hue", 0], entities: [] },
					{ ...EMPTY_DEVICE, entities: [] },
					// links to a device that is not part of the submission
					{
						...DEVICE,
						model: "Hue Bloom",
						via_device: ["hue", 9],
						entities: [],
					},
					{ manufacturer: 5 },
				],
				entities: [ENTITY, { ...ENTITY, domain: "sensor" }, { domain: 5 }],
			},
		}),
	);

	const observed = (name: string) => c.observed.filter((o) => o.name === name);

	await t.test("devices carrying nothing", (t: TestContext) => {
		t.assert.deepStrictEqual(observed("snapshot_empty_device_total"), [
			{
				name: "snapshot_empty_device_total",
				labels: { integration: "hue", version: VERSION },
				value: 1,
			},
		]);
	});

	await t.test("devices and entities it could not read", (t: TestContext) => {
		t.assert.deepStrictEqual(observed("snapshot_malformed_device_total"), [
			{
				name: "snapshot_malformed_device_total",
				labels: { integration: "hue", version: VERSION },
				value: 1,
			},
		]);
		t.assert.deepStrictEqual(observed("snapshot_malformed_entity_total"), [
			{
				name: "snapshot_malformed_entity_total",
				labels: { integration: "hue", version: VERSION },
				value: 1,
			},
		]);
	});

	await t.test("links it could not resolve", (t: TestContext) => {
		t.assert.deepStrictEqual(observed("snapshot_circular_device_link_total"), [
			{
				name: "snapshot_circular_device_link_total",
				labels: { integration: "hue", version: VERSION },
				value: 1,
			},
		]);
		t.assert.deepStrictEqual(observed("snapshot_dangling_device_link_total"), [
			{
				name: "snapshot_dangling_device_link_total",
				labels: { integration: "hue", version: VERSION },
				value: 1,
			},
		]);
	});

	await t.test("entities per integration and domain", (t: TestContext) => {
		t.assert.deepStrictEqual(observed("snapshot_integration_entity_total"), [
			{
				name: "snapshot_integration_entity_total",
				labels: {
					integration: "hue",
					version: VERSION,
					has_devices: "true",
					entity_domain: "light",
				},
				value: 1,
			},
			{
				name: "snapshot_integration_entity_total",
				labels: {
					integration: "hue",
					version: VERSION,
					has_devices: "true",
					entity_domain: "sensor",
				},
				value: 1,
			},
		]);
	});
});

test("unexpected user agent", (t: TestContext) => {
	const c = context();

	t.assert.throws(
		() =>
			invoke(
				c.controller,
				"post",
				request(
					{ hue: { devices: [], entities: [] } },
					{ "user-agent": "curl/8.7.1" },
				),
			),
		(error: unknown) =>
			error instanceof BadRequestException && error.getStatus() === 400,
	);
});
