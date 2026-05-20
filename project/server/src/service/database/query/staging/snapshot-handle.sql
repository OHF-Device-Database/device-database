-- name: InsertSubmission :one
insert into snapshot_submission (
    id,
    created_at
) values (
    ?,
    @createdAt
)
returning
    id,
    created_at "createdAt",
    hash,
    completed_at "completedAt";

-- name: UpdateSubmission :one
update snapshot_submission
set
    hash = @hash,
    completed_at = @completedAt
where
    id = @id
returning
    id,
    created_at "createdAt",
    hash,
    completed_at "completedAt";

-- name: GetSubmission :one
select
    id,
    created_at "createdAt",
    hash,
    completed_at "completedAt"
from
    snapshot_submission
where
    id = ?;

-- name: GetSubmissionByHash :one
select
    id,
    created_at "createdAt",
    hash,
    completed_at "completedAt"
from
    snapshot_submission
where
    hash = ?;
