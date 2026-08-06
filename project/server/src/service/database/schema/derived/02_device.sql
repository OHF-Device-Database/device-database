create table derived_device (
    -- synthetic identifier
    id text not null primary key,
    integration text not null,
    manufacturer text not null,
    model text,
    model_id text,
    first_encountered_at integer,
    versions_software text not null default '[]',
    versions_hardware text not null default '[]',
    entities text not null default '[]',
    count integer not null,
    -- device with normalized attributes that appears more often
    derived_device_id_canonical text references derived_device(id) deferrable initially deferred
) strict, without rowid;

create index derived_device_derived_device_id_canonical_idx on derived_device(derived_device_id_canonical);
