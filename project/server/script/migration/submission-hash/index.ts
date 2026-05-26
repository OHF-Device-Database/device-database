/** biome-ignore-all lint/style/noNonNullAssertion: migration script */

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
      snapshot_submission_device_permutation_id id
    from
      snapshot_submission_attribution_device_permutation
    where
      snapshot_submission_id = ?
    order by 1;
  `),
	attributionDevicePermutationLink: database.prepare(`
  	select
  	  snapshot_submission_device_permutation_link_id id
    from
      snapshot_submission_attribution_device_permutation_link
    where
      snapshot_submission_id = ?
    order by 1;
  `),
	attributionEntityDevicePermutation: database.prepare(`
    select
      snapshot_submission_set_entity_device_permutation_id id
    from
      snapshot_submission_attribution_set_entity_device_permutation
    where
      snapshot_submission_id = ?
    order by 1;
  `),
} as const;

for await (const submissionId of createInterface({ input: process.stdin })) {
	const hash = createHash("sha256");

	for (const { id } of prepared.attributionDevicePermutation.iterate(
		submissionId,
	)) {
		hash.update(id as string);
	}

	for (const { id } of prepared.attributionDevicePermutationLink.iterate(
		submissionId,
	)) {
		hash.update(id as string);
	}
	for (const { id } of prepared.attributionEntityDevicePermutation.iterate(
		submissionId,
	)) {
		hash.update(id as string);
	}

	console.log(
		JSON.stringify({
			submissionId,
			hash: `0-${hash.digest("base64")}`,
		}),
	);
}
