create table snapshot (
    id text not null primary key,
    version integer not null default -1,
    data text not null,
    contact text not null,
    created_at integer not null
) strict;
