-- while "20260420095727.sql" did remove duplicate "snapshot_submission_device_permutation_link" entries, it did not properly clean up attributions
-- when a submissions contained multiple identical device links, only one instance of that link was updated to point at the deduplicated identifier
-- all other instances were ignored, and were pointing at identifiers that were pending deletion
-- it was assumed that the "on delete cascade" definition on "snapshot_submission_attribution_device_permutation_link" would result in the deletion of affected identifiers
-- once they were deleted from "snapshot_submission_device_permutation_link", but this appears to not have been the case
delete from snapshot_submission_attribution_device_permutation_link where snapshot_submission_device_permutation_link_id not in (
    select
        id
    from
        snapshot_submission_device_permutation_link
);
