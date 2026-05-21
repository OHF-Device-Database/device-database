-- use temporary table with unique constraint for deduplication
create temporary table temp_snapshot_submission (
    id text not null primary key,
    hash text unique
) strict, without rowid;

insert into temp_snapshot_submission
select
    id,
    hash
from
    snapshot_submission
where
    hash is not null
on conflict (
    hash
)
do nothing;

create table snapshot_submission_attribution_submission (
	id text not null primary key,
	snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
	subject text not null,
	hass_version text not null,
	created_at integer not null
);
create index snapshot_submission_attribution_submission_snapshot_submission_id_id_idx on snapshot_submission_attribution_submission(snapshot_submission_id, id);
create index snapshot_submission_attribution_submission_subject_idx on snapshot_submission_attribution_submission(subject);
create index snapshot_submission_attribution_submission_hass_version_idx on snapshot_submission_attribution_submission(hass_version);

insert into snapshot_submission_attribution_submission
select
    -- reuse submission identifiers
    id,
    (
        select
            tss.id
        from
            temp_snapshot_submission tss
        where
            tss.hash = ss.hash
    ),
    subject,
    created_at,
    hass_version
from
    snapshot_submission ss;

pragma foreign_keys=off;

-- "on cascade" is pretty slow, bulk delete delete attributions referencing soon-to-be deleted submissions
delete from snapshot_submission_attribution_device where snapshot_submission_id not in (
    select
        id
    from
        temp_snapshot_submission
    );

delete from snapshot_submission_attribution_device_permutation where snapshot_submission_id not in (
    select
        id
    from
        temp_snapshot_submission
    );

delete from snapshot_submission_attribution_device_permutation_link where snapshot_submission_id not in (
    select
        id
    from
        temp_snapshot_submission
    );

delete from snapshot_submission_attribution_set_entity_device_permutation where snapshot_submission_id not in (
    select
        id
    from
        temp_snapshot_submission
    );

-- also delete orphaned entity ←→ device permutation associations
delete from snapshot_submission_set_entity_device_permutation where id not in (
    select
        snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_attribution_set_entity_device_permutation
);
delete from snapshot_submission_set_content_entity_device_permutation where snapshot_submission_set_entity_device_permutation_id not in (
    select
        id
    from
        snapshot_submission_set_entity_device_permutation
);

pragma foreign_keys=on;

delete from snapshot_submission where id not in (
    select
        id
    from
        temp_snapshot_submission
    );

alter table snapshot_submission drop column subject;
alter table snapshot_submission drop column hass_version;

create unique index snapshot_submission_hash_idx on snapshot_submission(hash);
