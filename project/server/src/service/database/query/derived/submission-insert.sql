-- name: InsertDerivedSubmission :exec
insert into derived_submission
select
    'unfinished' state,
    count(*) count
from
    snapshot_submission
where
    completed_at is null and
    -- consider unfinished if not completed after 60 seconds
    created_at < (unixepoch() - 60)
group by 1
union all
select
    'empty' state,
    count(*) count
from
    snapshot_submission ss left join snapshot_submission_attribution_device ssad on (
        ss.id = ssad.snapshot_submission_id
    )
where
    ssad.snapshot_submission_id is null
group by 1
union all
select
    'unreferenced' state,
    count(*) count
from
    snapshot_submission ss left join snapshot_submission_attribution_submission ssas on (
        ss.id = ssas.snapshot_submission_id
    )
where
    ssas.snapshot_submission_id is null
group by 1;
