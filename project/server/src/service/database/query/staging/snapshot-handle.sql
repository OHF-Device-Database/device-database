-- name: InsertSubmission :one
insert into snapshot_submission (
  id, subject, hass_version, created_at
) values (
  ?, ?, @hassVersion, @createdAt
)
returning
    id,
    subject,
    created_at "createdAt",
    hass_version "hassVersion",
    completed_at "completedAt";

-- name: UpdateSubmission :one
update snapshot_submission
set
    completed_at = @completedAt
where
    id = @id
returning
    id,
    subject,
    created_at "createdAt",
    hass_version "hassVersion",
    completed_at "completedAt";

-- name: GetSubmission :one
select
    id,
    subject,
    created_at "createdAt",
    hass_version "hassVersion",
    completed_at "completedAt"
from
    snapshot_submission
where
    id = ?;
