-- preflight:begin
pragma foreign_keys=off;
-- preflight:end

-- "on delete cascade" was missing from "snapshot_submission_device_id"
create table _snapshot_submission_device_permutation (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_device_id text not null references snapshot_submission_device(id) on delete cascade,
    entry_type text,
    -- boolean
    has_configuration_url integer,
    version_sw text,
    version_hw text
) strict, without rowid;

insert into _snapshot_submission_device_permutation select * from snapshot_submission_device_permutation;

drop table snapshot_submission_device_permutation;
-- foreign key enforcement is disabled, so "references snapshot_submission_device_permutation" clauses of dependent
-- tables are left untouched by the rename and keep pointing at the table below
alter table _snapshot_submission_device_permutation rename to snapshot_submission_device_permutation;

create unique index snapshot_submission_device_permutation_composite_idx on snapshot_submission_device_permutation(
    snapshot_submission_device_id,
    coalesce(entry_type, ''),
    coalesce(has_configuration_url, -1),
    coalesce(version_sw, ''),
    coalesce(version_hw, '')
);

-- postflight:begin
pragma foreign_keys=on;
-- postflight:end
