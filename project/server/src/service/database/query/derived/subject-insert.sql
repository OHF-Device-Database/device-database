-- name: InsertDerivedSubjects :exec
with lagged_submission as (
    select
        subject,
        created_at,
        lag(created_at) over (partition by subject order by created_at) as prev_created_at
    from
        snapshot_submission
    where
        subject in (
            -- only consider subjects that have submitted within window
            select
                subject
            from
                snapshot_submission
            where
                created_at >= (strftime('%s', 'now') - cast(@window as integer))
        )
)
insert into derived_subject
select
    subject,
    count(1) streak
from
    lagged_submission
where
    prev_created_at is not null and
    prev_created_at - created_at <= cast(@window as integer)
group by
    1;
