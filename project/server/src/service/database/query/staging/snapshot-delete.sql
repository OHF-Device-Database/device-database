-- name: DeleteSnapshot :exec
delete from snapshot_submission where id = @submissionId;
