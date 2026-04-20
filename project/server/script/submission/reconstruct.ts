/** biome-ignore-all lint/style/noNonNullAssertion: debug script */
/** biome-ignore-all lint/suspicious/noExplicitAny: debug script */

import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

// grouped by functional equivalence
const DATABASE_VERSION = [
	20251105105832n,
	20251125121625n,
	// ———
	20260116104046n,
	// ———
	20260120111330n,
	20260319161056n,
] as const;
type DatabaseVersion = (typeof DATABASE_VERSION)[number];

const isDatabaseVersion = (version: bigint): version is DatabaseVersion =>
	(DATABASE_VERSION as readonly bigint[]).includes(version);

const args = parseArgs({
	options: {
		"submission-id": { type: "string" },
		"database-path": { type: "string", default: "staging.db" },
		"database-version": { type: "string" },
	},
});

const {
	values: { "submission-id": submissionId, "database-path": databasePath },
} = args;

const {
	values: { "database-version": _databaseVersion },
} = args;

if (typeof submissionId === "undefined") {
	console.error(`missing parameter '--submission-id'`);
	process.exit(1);
}

const database = new DatabaseSync(databasePath);

let databaseVersion: DatabaseVersion;
if (typeof _databaseVersion === "undefined") {
	let extracted: bigint | undefined;
	try {
		const prepared = database.prepare(
			"select id from migration order by 1 desc limit 1",
		);
		prepared.setReadBigInts(true);
		extracted = prepared.get()?.id as bigint;
	} catch {
		console.error(
			"could not determine database version automatically, manually provide version with '--database-version'",
		);
		process.exit(1);
	}

	if (isDatabaseVersion(extracted)) {
		databaseVersion = extracted;
	} else {
		databaseVersion = DATABASE_VERSION.at(-1)!;
		console.warn(
			`detected unsupported database version <${extracted}>, falling back to last supported version <${databaseVersion}>`,
		);
	}
} else {
	let parsed;
	try {
		parsed = BigInt(_databaseVersion);
	} catch {
		console.error(`invalid database version <${_databaseVersion}>`);
		process.exit(1);
	}

	if (!isDatabaseVersion(parsed)) {
		console.error(
			`invalid parameter --database-version (one of ${DATABASE_VERSION.join(", ")})`,
		);
		process.exit(1);
	}

	databaseVersion = parsed;
}

type Device = {
	readonly entry_type: string | null;
	readonly has_configuration_url: boolean;
	readonly hw_version: string | null;
	readonly manufacturer: string | null;
	readonly model_id: string | null;
	readonly model: string | null;
	readonly sw_version: string | null;
	via_device: [string, number] | null;
	entities: Entity[];

	readonly _id: {
		readonly self: string;
		readonly permutation: string;
	};
};

type Entity = {
	readonly assumed_state: boolean | null;
	readonly domain: string;
	readonly entity_category: string | null;
	readonly has_entity_name: boolean;
	readonly original_device_class: string | null;
	readonly unit_of_measurement: string | null;

	readonly _id: string;
};

const prepared = {
	device: database.prepare(`
    select
      id,
      integration,
      manufacturer,
      model,
      model_id
    from
      snapshot_submission_device
    where
      id = ?;
  `),
	devicePermutation: database.prepare(`
    select
      id,
      snapshot_submission_device_id,
      entry_type,
      has_configuration_url,
      version_sw,
      version_hw
    from
      snapshot_submission_device_permutation
    where
      id = ?;
  `),
	attributionDevicePermutation: database.prepare(`
    select
      snapshot_submission_device_permutation_id id
    from
      snapshot_submission_attribution_device_permutation
    where
      snapshot_submission_id = ?
    order by 1;
  `),
	devicePermutationLink: database.prepare(`
    select
      snapshot_submission_device_permutation_id_parent as "idParent",
      snapshot_submission_device_permutation_id_child as "idChild"
    from
      snapshot_submission_device_permutation_link
    where
      id = ?;
  `),
	attributionDevicePermutationLink: database.prepare(`
    select
      snapshot_submission_device_permutation_link_id as "id"
    from
      snapshot_submission_attribution_device_permutation_link
    where
      snapshot_submission_id = ?
    order by 1;
  `),
	entity: database.prepare(`
    select
      id,
      domain,
      assumed_state,
      has_name,
      category,
      original_device_class,
      unit_of_measurement
    from
      snapshot_submission_entity
    where
      id = ?;
  `),
} as const;

const bindGetIntegrationEntityQualifiers: () => (
	submissionId: string,
) => [id: string, integration: string][] = () => {
	switch (databaseVersion) {
		case 20251105105832n:
		case 20251125121625n:
		case 20260116104046n: {
			const prepared = database.prepare(`
        select
          ssei.snapshot_submission_entity_id as "id",
          ssei.integration
        from
          snapshot_submission_attribution_entity_integration ssaei join snapshot_submission_entity_integration ssei on (
            ssaei.snapshot_submission_entity_integration_id = ssei.id
          )
        where
          snapshot_submission_id = ?
        order by 1, 2;
      `);
			return (submissionId: string) => {
				return prepared
					.all(submissionId)
					.map((item): [string, string] => [
						item.id as string,
						item.integration as string,
					]);
			};
		}
		case 20260120111330n:
		case 20260319161056n: {
			return () => {
				return [];
			};
		}
	}
};

const bindGetDeviceEntityQualifiers: () => (
	submissionId: string,
) => [devicePermutationId: string, entityId: string][] = () => {
	switch (databaseVersion) {
		case 20251105105832n:
		case 20251125121625n: {
			const prepared = database.prepare(`
        select
          snapshot_submission_entity_id as "entityId",
          snapshot_submission_device_permutation_id as "devicePermutationId"
        from
          snapshot_submission_attribution_entity_device_permutation ssaedp join snapshot_submission_entity_device_permutation ssedp on (
            ssaedp.snapshot_submission_entity_device_permutation_id = ssedp.id
          )
        where
          snapshot_submission_id = ?,
        order by 1, 2;
      `);

			return (submissionId: string) => {
				return prepared
					.all(submissionId)
					.map((item) => [
						item.entityId as string,
						item.devicePermutationId as string,
					]);
			};
		}

		case 20260116104046n:
		case 20260120111330n:
		case 20260319161056n: {
			const prepared = database.prepare(`
           select distinct
             ssscedp.snapshot_submission_entity_id as "entityId",
             sssedp.snapshot_submission_device_permutation_id as "devicePermutationId"
           from
             snapshot_submission_attribution_set_entity_device_permutation ssasedp join snapshot_submission_set_entity_device_permutation sssedp on (
               ssasedp.snapshot_submission_set_entity_device_permutation_id = sssedp.id
             ) join snapshot_submission_set_content_entity_device_permutation ssscedp on (
               ssasedp.snapshot_submission_set_entity_device_permutation_id = ssscedp.snapshot_submission_set_entity_device_permutation_id
             )
           where
             snapshot_submission_id = ?
           order by 1, 2;
         `);

			return (submissionId: string) => {
				return prepared
					.all(submissionId)
					.map((item) => [
						item.entityId as string,
						item.devicePermutationId as string,
					]);
			};
		}
	}
};

const getIntegrationEntityQualifiers = bindGetIntegrationEntityQualifiers();
const getDeviceEntityQualifiers = bindGetDeviceEntityQualifiers();

const getEntity = (id: string): Entity => {
	const entity = prepared.entity.get(id);

	return {
		assumed_state:
			entity!.assumed_state !== null ? Boolean(entity!.assumed_state) : null,
		domain: entity!.domain,
		entity_category: entity!.entity_category,
		has_entity_name: Boolean(entity!.has_entity_name),
		original_device_class: entity!.original_device_class,
		unit_of_measurement: entity!.unit_of_measurement,
		_id: entity!.id,
	} as Entity;
};

// integration → devices
const devices: Map<string, Device[]> = new Map();
// integration → entities
const entities: Map<string, Entity[]> = new Map();
// device permutation id → device offset
const links: Map<string, [integration: string, deviceIndex: number]> =
	new Map();

for (const { id } of prepared.attributionDevicePermutation.iterate(
	submissionId,
)) {
	const devicePermutation = prepared.devicePermutation.get(id);
	const device = prepared.device.get(
		devicePermutation!.snapshot_submission_device_id,
	);

	const merged = {
		_id: {
			self: device!.id,
			permutation: devicePermutation!.id,
		},
		entry_type: devicePermutation!.entry_type,
		has_configuration_url:
			devicePermutation!.has_configuration_url !== null
				? Boolean(devicePermutation!.has_configuration_url)
				: null,
		sw_version: devicePermutation!.version_sw,
		hw_version: devicePermutation!.version_hw,
		manufacturer: device!.manufacturer,
		model: device!.model,
		model_id: device!.model_id,
		// initialized later ↓
		via_device: null,
		entities: [],
	} as Device;

	let index;
	const key = device!.integration as string;
	const bucket = devices.get(key);
	if (typeof bucket === "undefined") {
		devices.set(key, [merged]);
		index = 0;
	} else {
		bucket.push(merged);
		index = bucket.length - 1;
	}

	links.set(devicePermutation!.id as string, [
		device!.integration as string,
		index,
	]);
}

// populate "via_device" links
for (const { id } of prepared.attributionDevicePermutationLink.iterate(
	submissionId,
)) {
	const { idParent, idChild } = prepared.devicePermutationLink.get(id)!;

	const parentLink = links.get(idParent as string)!;
	const childLink = links.get(idChild as string)!;

	devices.get(childLink[0]!)![childLink[1]].via_device = parentLink;
}

// populate device entities
for (const [entityId, devicePermutationId] of getDeviceEntityQualifiers(
	submissionId,
)) {
	const entity = getEntity(entityId);
	const link = links.get(devicePermutationId)!;

	devices.get(link![0]!)![link[1]].entities.push(entity);
}

for (const [id, integration] of getIntegrationEntityQualifiers(submissionId)) {
	const entity = getEntity(id);

	const bucket = entities.get(integration);
	if (typeof bucket === "undefined") {
		entities.set(integration, [entity]);
	} else {
		bucket.push(entity);
	}
}

const integrations = new Set<string>();
for (const integration of devices.keys()) {
	integrations.add(integration);
}
for (const integration of entities.keys()) {
	integrations.add(integration);
}

console.log(
	JSON.stringify(
		Object.fromEntries(
			[...integrations].map((integration) => [
				integration,
				{
					devices: devices.get(integration) ?? [],
					entities: entities.get(integration) ?? [],
				},
			]),
		),
		undefined,
		4,
	),
);
