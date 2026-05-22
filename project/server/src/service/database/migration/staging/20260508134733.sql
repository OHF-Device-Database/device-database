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

create index snapshot_submission_attribution_submission_snapshot_submission_id_id_idx on snapshot_submission_attribution_submission(snapshot_submission_id, id);
create index snapshot_submission_attribution_submission_subject_idx on snapshot_submission_attribution_submission(subject);
create index snapshot_submission_attribution_submission_hass_version_idx on snapshot_submission_attribution_submission(hass_version);

select '[*] "snapshot_submission_attribution_submission" populated';

-- "on cascade" is slow, bulk delete delete attributions referencing soon-to-be deleted submissions
-- "not in" is also slow, "in" with left join is _way_ faster

delete from snapshot_submission_attribution_device where snapshot_submission_id in (
    select
        ss.id
    from
        snapshot_submission ss left join temp_snapshot_submission tss on (
            tss.id = ss.id
        )
    where
        tss.id is null
);

select '[*] orphaned "snapshot_submission_attribution_device" entries cleared';

delete from snapshot_submission_attribution_device_permutation where snapshot_submission_id in (
    select
        ss.id
    from
        snapshot_submission ss left join temp_snapshot_submission tss on (
            tss.id = ss.id
        )
    where
        tss.id is null
);

select '[*] orphaned "snapshot_submission_attribution_device_permutation" entries cleared';

delete from snapshot_submission_attribution_device_permutation_link where snapshot_submission_id in (
    select
        ss.id
    from
        snapshot_submission ss left join temp_snapshot_submission tss on (
            tss.id = ss.id
        )
    where
        tss.id is null
);

select '[*] orphaned "snapshot_submission_attribution_device_permutation_link" entries cleared';

-- by far the slowest, temporarily drop index to speed up
drop index snapshot_submission_attribution_set_entity_device_permutation_snapshot_submission_id_idx;
delete from snapshot_submission_attribution_set_entity_device_permutation where snapshot_submission_id in (
    select
        ss.id
    from
        snapshot_submission ss left join temp_snapshot_submission tss on (
            tss.id = ss.id
        )
    where
        tss.id is null
);
create index snapshot_submission_attribution_set_entity_device_permutation_snapshot_submission_id_idx on snapshot_submission_attribution_set_entity_device_permutation (snapshot_submission_id);

select '[*] orphaned "snapshot_submission_attribution_set_entity_device_permutation" entries cleared';

-- also delete orphaned entity ←→ device permutation associations
delete from snapshot_submission_set_entity_device_permutation where id in (
    select
        sssedp.id
    from
        snapshot_submission_set_entity_device_permutation sssedp join snapshot_submission_attribution_set_entity_device_permutation ssasedp on (
            sssedp.id = ssasedp.snapshot_submission_set_entity_device_permutation_id
        )
    where
        ssasedp.snapshot_submission_set_entity_device_permutation_id is null
);

select '[*] orphaned "snapshot_submission_set_entity_device_permutation" entries cleared';

delete from snapshot_submission_set_content_entity_device_permutation where snapshot_submission_set_entity_device_permutation_id in (
    select
        ssscedp.snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_set_content_entity_device_permutation ssscedp left join snapshot_submission_set_entity_device_permutation sssedp on (
            ssscedp.snapshot_submission_set_entity_device_permutation_id = sssedp.id
        )
    where
        sssedp.id is null
);

select '[*] orphaned "snapshot_submission_set_content_entity_device_permutation" entries cleared';

delete from snapshot_submission where id not in (
    select
        id
    from
        temp_snapshot_submission
    );

select '[*] deduplicated "snapshot_submission"';

alter table snapshot_submission drop column subject;
alter table snapshot_submission drop column hass_version;

create unique index snapshot_submission_hash_idx on snapshot_submission(hash);
