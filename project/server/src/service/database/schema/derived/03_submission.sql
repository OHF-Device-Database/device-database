create table derived_submission (
    state text not null check(state in ('unfinished', 'empty')),
    count integer not null,
    primary key(state)
) strict, without rowid;
