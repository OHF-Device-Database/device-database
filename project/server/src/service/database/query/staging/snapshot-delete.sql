-- name: DeleteSnapshot :exec
delete from snapshot_submission where id = @submissionId;

-- name: DeleteAttributionSubmission :exec
delete from snapshot_submission_attribution_submission where id = ?;

-- name: DeleteAttributionSubmissionFromRevokedSubjectByCutoff :exec
with revoked as (
    select
        subject,
        max(created_at) max_created_at
    from
        snapshot_submission_attribution_submission
    group by 1
)
delete from snapshot_submission_attribution_submission where subject in (
    select
        subject
    from
        revoked
    where
        max_created_at < cast(@cutoff as integer)
);

-- name: DeleteOrphanedDevice :exec
delete from snapshot_submission_device where id not in (
    select
        snapshot_submission_device_id
    from
        snapshot_submission_attribution_device
);

-- name: DeleteOrphanedDevicePermutationLink :exec
delete from snapshot_submission_device_permutation_link where id not in (
    select
        snapshot_submission_device_permutation_link_id
    from
        snapshot_submission_attribution_device_permutation_link
);

-- name: DeleteOrphanedDevicePermutation :exec
delete from snapshot_submission_device_permutation where id not in (
    select
        snapshot_submission_device_permutation_id
    from
        snapshot_submission_attribution_device_permutation
);

-- name: DeleteOrphanedEntitySetContent :exec
delete from snapshot_submission_set_content_entity_device_permutation where snapshot_submission_set_entity_device_permutation_id not in (
    select
        snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_attribution_set_entity_device_permutation
);

-- name: DeleteOrphanedEntitySet :exec
delete from snapshot_submission_set_entity_device_permutation where id not in (
    select
        snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_set_content_entity_device_permutation
);

-- name: DeleteOrphanedEntity :exec
delete from snapshot_submission_entity where id not in (
    select
        snapshot_submission_entity_id
    from
        snapshot_submission_set_content_entity_device_permutation
);

-- name: DeleteOrphanedSubmission :exec
delete from snapshot_submission where id not in (
    select
        snapshot_submission_id
    from
        snapshot_submission_attribution_submission
);
