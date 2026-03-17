-- name: InsertDerivedSubmission :exec
insert into derived_submission select
    hass_version,
    'unfinished' state,
    count(*) count
from
    snapshot_submission
where
    completed_at is null and
    -- consider unfinished if not completed after 60 seconds
    created_at < (unixepoch() - 60)
group by 2
union all
select
    hass_version,
    'empty' state,
    count(*) count
from
    snapshot_submission ss left join snapshot_submission_attribution_device ssad on (
        ss.id = ssad.snapshot_submission_id
    )
where
    ssad.snapshot_submission_id is null
group by 2
