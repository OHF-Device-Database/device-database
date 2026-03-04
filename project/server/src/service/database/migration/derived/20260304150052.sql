create table derived_subject (
    subject text primary key not null,
    streak integer not null
) strict, without rowid;

create table derived_device (
    -- synthetic identifier
    id text not null primary key,
    integration text not null,
    manufacturer text not null,
    model text,
    model_id text,
    count integer not null
) strict, without rowid;
