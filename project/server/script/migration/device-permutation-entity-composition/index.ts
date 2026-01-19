import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		"database-path": { type: "string" },
	},
});

const databasePath = values["database-path"];
if (typeof databasePath === "undefined") {
	console.error(
		"required parameter '--database-path' missing (location of database)",
	);
	process.exit(1);
}

const db = new DatabaseSync(databasePath);

const insertSet = db.prepare(`
  insert into snapshot_submission_set_entity_device_permutation (
      id,
      hash,
      snapshot_submission_device_permutation_id
  ) values (
      @id,
      @hash,
      @devicePermutationId
  )
  on conflict (
      hash,
      snapshot_submission_device_permutation_id
  ) do update set
      -- no-op so that returning clause always returns a row
      hash = hash
  returning
      id,
      hash,
      snapshot_submission_device_permutation_id "devicePermutationId";`);
const insertSetContent = db.prepare(`
  insert into snapshot_submission_set_content_entity_device_permutation (
      snapshot_submission_set_entity_device_permutation_id,
      snapshot_submission_entity_id
  ) values (
      @setEntityDevicePermutationId,
      @entityId
  )`);
const insertSetAttribution = db.prepare(`
  insert into snapshot_submission_attribution_set_entity_device_permutation (
      id,
      snapshot_submission_id,
      snapshot_submission_set_entity_device_permutation_id
  ) values (
      @id,
      @submissionId,
      @setEntityDevicePermutationId
  );`);

{
	const stmt = db.prepare(`
select distinct
  ssaedp.snapshot_submission_id,
  ssedp.snapshot_submission_device_permutation_id,
  json_group_array(
      distinct ssedp.snapshot_submission_entity_id order by ssedp.snapshot_submission_entity_id
  ) "entities"
from
  snapshot_submission_entity_device_permutation ssedp join snapshot_submission_attribution_entity_device_permutation ssaedp on (
    ssedp.id = ssaedp.snapshot_submission_entity_device_permutation_id
  ) join snapshot_submission ss on (
    ss.id = ssaedp.snapshot_submission_id
  )
group by
  ssaedp.snapshot_submission_id, ssedp.snapshot_submission_device_permutation_id;`);

	for (const row of stmt.iterate()) {
		const submissionId = row.snapshot_submission_id;
		const devicePermutationId = row.snapshot_submission_device_permutation_id;
		const entities = row.entities;

		const hash = createHash("sha256");
		const parsedEntities = JSON.parse(entities as string).sort();
		for (const entityId of parsedEntities) {
			hash.update(entityId);
		}

		const digested = hash.digest("base64");

		let setId: string = randomUUID();
		let setExists;
		{
			const rows = insertSet.all({
				id: setId,
				hash: digested,
				devicePermutationId,
			});
			const id = rows[0].id;
			setExists = setId !== id;
			setId = id as string;
		}

		insertSetAttribution.run({
			id: randomUUID(),
			submissionId,
			setEntityDevicePermutationId: setId,
		});

		if (setExists) {
			continue;
		}

		for (const entityId of parsedEntities) {
			insertSetContent.run({ setEntityDevicePermutationId: setId, entityId });
		}
	}
}
