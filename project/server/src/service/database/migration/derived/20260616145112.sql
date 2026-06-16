create table _derived_submission (
    state text not null check(state in ('unfinished', 'empty', 'unreferenced')),
    count integer not null,
    primary key(state)
) strict, without rowid;

insert into _derived_submission (state, count)
select
    state,
    count
from
    derived_submission
where
    state in ('unfinished', 'empty');

drop table derived_submission;

alter table _derived_submission rename to derived_submission;
