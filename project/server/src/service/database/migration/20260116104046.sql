create table snapshot_submission_set_entity_device_permutation (
    id text not null primary key,
    hash text not null,
    snapshot_submission_device_permutation_id text not null references snapshot_submission_device_permutation(id) on delete cascade,
    unique(hash, snapshot_submission_device_permutation_id)
) strict, without rowid;

create table snapshot_submission_set_content_entity_device_permutation (
    snapshot_submission_set_entity_device_permutation_id text not null references snapshot_submission_set_entity_device_permutation(id) on delete cascade,
    snapshot_submission_entity_id text not null references snapshot_submission_entity(id) on delete cascade,
    primary key(snapshot_submission_set_entity_device_permutation_id, snapshot_submission_entity_id)
) strict, without rowid;

create table snapshot_submission_attribution_set_entity_device_permutation (
    id text not null,
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_set_entity_device_permutation_id text not null references snapshot_submission_set_entity_device_permutation(id) on delete cascade,
    primary key(id, snapshot_submission_id)
) strict, without rowid;
