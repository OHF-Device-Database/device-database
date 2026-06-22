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
    count integer not null
) strict, without rowid;
