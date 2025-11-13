drop view snapshot_device_entity_v1;
drop view snapshot_device_entity_v2;
drop view snapshot_device_entity;

drop view snapshot_device;
drop view snapshot_device_v0;
drop view snapshot_device_v1;
drop view snapshot_device_v2;

drop table snapshot;

create table snapshot_submission (
    id text not null primary key,
    subject text not null,
    created_at integer not null,
    hass_version text not null,
    -- updated once device / entity data is fully consumed
    completed_at integer
) strict, without rowid;

-- → device
create table snapshot_submission_device (
    -- synthetic identifier
    id text not null primary key,
    integration text not null,
    manufacturer text,
    model text,
    model_id text
) strict, without rowid;
create unique index snapshot_submission_device_composite_idx on snapshot_submission_device(
    integration,
    coalesce(manufacturer, ''),
    coalesce(model, ''),
    coalesce(model_id, '')
);

create table snapshot_submission_attribution_device (
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_device_id text not null references snapshot_submission_device(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_device_id)
) strict, without rowid;
-- ← device

-- → device permutation
create table snapshot_submission_device_permutation (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_device_id text not null references snapshot_submission_device(id),
    entry_type text,
    -- boolean
    has_configuration_url integer,
    version_sw text,
    version_hw text
) strict, without rowid;
create unique index snapshot_submission_device_permutation_composite_idx on snapshot_submission_device_permutation(
    snapshot_submission_device_id,
    coalesce(entry_type, ''),
    coalesce(has_configuration_url, -1),
    coalesce(version_sw, ''),
    coalesce(version_hw, '')
);
create table snapshot_submission_attribution_device_permutation (
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_device_permutation_id text not null references snapshot_submission_device_permutation(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_device_permutation_id)
) strict, without rowid;

-- links are *not* deduplicated, because that would cause some gnarly edge-cases
-- e.g. initial submission includes device permutation (a) and (b) and establishes a link between them
-- another submission also includes both (a) and (b), but does not link them
-- to represent both scenarios with deduplication, the linkage would need to be part of the device permutation's unique constraint,
-- which it can't be, because the identifier only becomes known *after* all permutations are inserted
create table snapshot_submission_device_permutation_link (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_device_permutation_id_parent text not null references snapshot_submission_device_permutation(id) on delete cascade,
    snapshot_submission_device_permutation_id_child text not null references snapshot_submission_device_permutation(id) on delete cascade,
    unique(id, snapshot_submission_device_permutation_id_parent, snapshot_submission_device_permutation_id_child),
    check(snapshot_submission_device_permutation_id_parent != snapshot_submission_device_permutation_id_child)
) strict, without rowid;

create table snapshot_submission_attribution_device_permutation_link (
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_device_permutation_link_id text not null references snapshot_submission_device_permutation_link(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_device_permutation_link_id)
) strict, without rowid;
-- ← device permutation

-- → entity
create table snapshot_submission_entity (
    -- synthetic identifier
    id text not null primary key,
    domain text not null,
    -- boolean
    assumed_state integer,
    -- boolean
    has_name integer not null,
    category text,
    original_device_class text,
    unit_of_measurement text
) strict, without rowid;
create unique index snapshot_submission_entity_composite_idx on snapshot_submission_entity(
    domain,
    coalesce(assumed_state, -1),
    has_name,
    coalesce(category, ''),
    coalesce(original_device_class, ''),
    coalesce(unit_of_measurement, '')
);

-- entities can be associated with devices *and* integrations
-- not storing the integration alongside the entity itself allows deduplication of entities across integrations / devices
create table snapshot_submission_entity_integration (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_entity_id text not null references snapshot_submission_entity(id) on delete cascade,
    integration text not null,
    unique(id, snapshot_submission_entity_id, integration)
) strict, without rowid;
create index snapshot_submission_entity_integration_integration_idx on snapshot_submission_entity_integration(integration);

create table snapshot_submission_attribution_entity_integration (
    snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
    snapshot_submission_entity_integration_id text not null references snapshot_submission_entity_integration(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_entity_integration_id)
) strict, without rowid;

create table snapshot_submission_entity_device_permutation (
    -- synthetic identifier
    id text not null primary key,
    snapshot_submission_entity_id text not null references snapshot_submission_entity(id) on delete cascade,
    snapshot_submission_device_permutation_id text not null references snapshot_submission_device_permutation(id) on delete cascade,
    unique(id, snapshot_submission_entity_id, snapshot_submission_device_permutation_id)
) strict, without rowid;

create table snapshot_submission_attribution_entity_device_permutation (
    snapshot_submission_id text not null references snapshot_submission(id),
    snapshot_submission_entity_device_permutation_id text not null references snapshot_submission_entity_device_permutation(id) on delete cascade,
    primary key(snapshot_submission_id, snapshot_submission_entity_device_permutation_id)
) strict, without rowid;
-- ← entity
