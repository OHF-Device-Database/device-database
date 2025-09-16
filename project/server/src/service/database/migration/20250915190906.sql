create table snapshot (
    id text not null primary key,
    data text not null,
    contact text not null,
    created_at integer not null
) strict;
