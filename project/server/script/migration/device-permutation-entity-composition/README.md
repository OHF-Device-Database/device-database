migrates contents of `snapshot_submission_entity_device_permutation` and `snapshot_submission_attribution_entity_device_permutation` into less-naive representation (`snapshot_submission_set_entity_device_permutation`, `snapshot_submission_set_content_entity_device_permutation`. `snapshot_submission_attribution_set_entity_device_permutation`)

1. obtain database that holds populated `snapshot_submission_entity_device_permutation` and `snapshot_submission_attribution_entity_device_permutation` tables
2. apply migration that creates the new tables (`20260116104046.sql`)
3. run the script
   ```
   node script/migration/device-permutation-entity-composition/index.ts --database-path server.db
   ```
4. create a dump to consequently apply to production database
   ```
   { echo "begin immediate transaction;"; sqlite3 server.db ".dump --data-only 'snapshot_submission_set_entity_device_permutation' 'snapshot_submission_set_content_entity_device_permutation' 'snapshot_submission_attribution_set_entity_device_permutation'"; echo "commit;" } > dump.sql
   ```
5. dump postprocessing
   ```
   sed -i 's/);/) on conflict do nothing;/' dump.sql
   ```

once `snapshot_submission_entity_device_permutation` and `snapshot_submission_attribution_entity_device_permutation` have been dropped, this script is not needed anymore
