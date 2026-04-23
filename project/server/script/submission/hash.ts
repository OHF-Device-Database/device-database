/** biome-ignore-all lint/style/noNonNullAssertion: debug script */

// used for entropy analysis, generates neither "v1-<>" nor "v2-<>" compatible hashes

import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

const args = parseArgs({
	options: {
		"database-path": { type: "string", default: "staging.db" },
	},
});

const {
	values: { "database-path": databasePath },
} = args;

const database = new DatabaseSync(databasePath);

const prepared = {
	attributionDevicePermutation: database.prepare(`
    select
      snapshot_submission_device_permutation_id id,
      ssd.integration
    from
      snapshot_submission_attribution_device_permutation ssadp join snapshot_submission_device_permutation ssdp on (
        ssadp.snapshot_submission_device_permutation_id = ssdp.id
      ) join snapshot_submission_device ssd on (
        ssdp.snapshot_submission_device_id = ssd.id
      )
    where
      snapshot_submission_id = ?
    order by 1, 2;
  `),
	attributionDevicePermutationLink: database.prepare(`
	 -- due to faulty unique constraint in "snapshot_submission_device_permutation_link" dereferencing is necessary
    select
      ssdpl.snapshot_submission_device_permutation_id_parent as parent,
      ssdpl.snapshot_submission_device_permutation_id_child as child
    from
      snapshot_submission_attribution_device_permutation_link ssadpl join snapshot_submission_device_permutation_link ssdpl on (
        ssadpl.snapshot_submission_device_permutation_link_id = ssdpl.id
      )
    where
      snapshot_submission_id = ?
    order by 1, 2;
  `),
	attributionEntityDevicePermutation: database.prepare(`
    select distinct
      ssscedp.snapshot_submission_entity_id as "entityId",
      sssedp.snapshot_submission_device_permutation_id as "devicePermutationId",
      ssd.integration
    from
      snapshot_submission_attribution_set_entity_device_permutation ssasedp join snapshot_submission_set_entity_device_permutation sssedp on (
        ssasedp.snapshot_submission_set_entity_device_permutation_id = sssedp.id
      ) join snapshot_submission_set_content_entity_device_permutation ssscedp on (
        ssasedp.snapshot_submission_set_entity_device_permutation_id = ssscedp.snapshot_submission_set_entity_device_permutation_id
      ) join snapshot_submission_device_permutation ssdp on (
        sssedp.snapshot_submission_device_permutation_id = ssdp.id
      ) join snapshot_submission_device ssd on (
        ssdp.snapshot_submission_device_id = ssd.id
      )
    where
      snapshot_submission_id = ?
    order by 1, 2, 3;
  `),
} as const;

for await (const submissionId of createInterface({ input: process.stdin })) {
	const hasherWhole = createHash("sha256");

	const hasherDevicePermutation = createHash("sha256");
	for (const {
		id,
		integration,
	} of prepared.attributionDevicePermutation.iterate(submissionId)) {
		hasherWhole.update(id as string);
		hasherWhole.update(integration as string);

		hasherDevicePermutation.update(id as string);
		hasherDevicePermutation.update(integration as string);
	}

	const hasherDevicePermutationLink = createHash("sha256");
	for (const {
		parent,
		child,
	} of prepared.attributionDevicePermutationLink.iterate(submissionId)) {
		hasherWhole.update(parent as string);
		hasherWhole.update(child as string);

		hasherDevicePermutationLink.update(parent as string);
		hasherDevicePermutationLink.update(child as string);
	}

	const hasherEntityDevicePermutation = createHash("sha256");
	for (const {
		entityId,
		devicePermutationId,
		integration,
	} of prepared.attributionEntityDevicePermutation.iterate(submissionId)) {
		hasherWhole.update(entityId as string);
		hasherWhole.update(devicePermutationId as string);
		hasherWhole.update(integration as string);

		hasherEntityDevicePermutation.update(entityId as string);
		hasherEntityDevicePermutation.update(devicePermutationId as string);
		hasherEntityDevicePermutation.update(integration as string);
	}

	console.log(
		JSON.stringify({
			submissionId,
			hash: {
				whole: hasherWhole.digest("hex"),
				"device-permutation": hasherDevicePermutation.digest("hex"),
				"device-permutation-link": hasherDevicePermutationLink.digest("hex"),
				"entity-device-permutation":
					hasherEntityDevicePermutation.digest("hex"),
			},
		}),
	);
}
