create table derived_submission (
    hass_version text not null,
    state text not null check(state in ('finished', 'unfinished', 'empty')),
    count integer not null,
    primary key(hass_version, state)
) strict, without rowid;
