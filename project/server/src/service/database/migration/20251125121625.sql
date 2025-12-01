-- alter table doesn't support updating `on delete` instruction
-- → load data into temporary table, drop the original one, and recreate with instruction
-- this would be a **bad** idea when dealing with lots of data, but we aren't yet, so it's fine 🙈

create temporary table snapshot_submission_attribution_entity_device_permutation_tmp as select * from snapshot_submission_attribution_entity_device_permutation;
drop table snapshot_submission_attribution_entity_device_permutation;

create table snapshot_submission_attribution_entity_device_permutation (
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_entity_device_permutation_id text not null references snapshot_submission_entity_device_permutation(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_entity_device_permutation_id)
) strict, without rowid;

insert into snapshot_submission_attribution_entity_device_permutation select * from snapshot_submission_attribution_entity_device_permutation_tmp;
