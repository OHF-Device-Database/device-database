-- use temporary table with fixed unique constraint for deduplication
create temporary table temp_snapshot_submission_device_permutation_link (
    id text not null primary key,
    snapshot_submission_device_permutation_id_parent text not null,
    snapshot_submission_device_permutation_id_child text not null,
    unique(snapshot_submission_device_permutation_id_parent, snapshot_submission_device_permutation_id_child),
    check(snapshot_submission_device_permutation_id_parent != snapshot_submission_device_permutation_id_child)
);

-- identical parent / child pairings currently have many identifiers → pick arbitrary one
insert into temp_snapshot_submission_device_permutation_link
select
    id,
    snapshot_submission_device_permutation_id_parent,
    snapshot_submission_device_permutation_id_child
from
    snapshot_submission_device_permutation_link
where
    /*
    https://sqlite.org/lang_insert.html
    "To avoid a parsing ambiguity, the SELECT statement should always contain a WHERE clause, even if that clause is simply "WHERE true", if the upsert-clause is present.
    Without the WHERE clause, the parser does not know if the token "ON" is part of a join constraint on the SELECT, or the beginning of the upsert-clause.
    */
    true
on conflict (
    snapshot_submission_device_permutation_id_parent,
    snapshot_submission_device_permutation_id_child
) do nothing;

-- update attribution table to point at arbitrarily picked identifier of particular pairing
with deduplicated as (
    select
        ssdpl.id,
        ssdpl.snapshot_submission_device_permutation_id_parent,
        ssdpl.snapshot_submission_device_permutation_id_child,
        tssdpl.id as new_id
    from
        snapshot_submission_device_permutation_link ssdpl join temp_snapshot_submission_device_permutation_link tssdpl on (
            ssdpl.snapshot_submission_device_permutation_id_parent = tssdpl.snapshot_submission_device_permutation_id_parent and
            ssdpl.snapshot_submission_device_permutation_id_child = tssdpl.snapshot_submission_device_permutation_id_child
        )
)
-- "or ignore" clause necessary, as multiple occurrences of the same device within a submission violate unique constraint
update or ignore snapshot_submission_attribution_device_permutation_link set snapshot_submission_device_permutation_link_id = (
    select
        new_id
    from
        deduplicated
    where
        id = snapshot_submission_device_permutation_link_id
);

-- remove orphaned links and indirectly also attributions through "on delete cascade" constraints
delete from snapshot_submission_device_permutation_link where id not in (
    select
        tssdpl.id
    from
        temp_snapshot_submission_device_permutation_link tssdpl
    );

-- unique constraints can't be altered → disable foreign key enforcement so that "on delete cascade" constraints don't fire
pragma foreign_keys=off;

-- recreate table with modified unique constraint
drop table snapshot_submission_device_permutation_link;
create table snapshot_submission_device_permutation_link (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_device_permutation_id_parent text not null references snapshot_submission_device_permutation(id) on delete cascade,
    snapshot_submission_device_permutation_id_child text not null references snapshot_submission_device_permutation(id) on delete cascade,
    unique(snapshot_submission_device_permutation_id_parent, snapshot_submission_device_permutation_id_child),
    check(snapshot_submission_device_permutation_id_parent != snapshot_submission_device_permutation_id_child)
) strict, without rowid;

-- insert deduplicated data
insert into snapshot_submission_device_permutation_link select * from temp_snapshot_submission_device_permutation_link;

-- reenable foreign key enforcement
pragma foreign_keys=on;
