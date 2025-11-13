-- name: GetSnapshotByCreatedAtRangeAndCompleted :many
select
    id,
    subject,
    created_at "createdAt",
    hass_version "hassVersion",
    completed_at "completedAt"
from
    snapshot_submission
where
    created_at >= min(cast(@a as integer), cast(@b as integer)) and
    created_at <= max(cast(@a as integer), cast(@b as integer)) and
    case
        cast(@complete as integer)
        when 1 then completed_at is not null
        when 0 then completed_at is null
        else true
    end
order by created_at desc;

-- name: GetSnapshotBySubject :many
select
    id,
    subject,
    created_at "createdAt",
    hass_version "hassVersion",
    completed_at "completedAt"
from
    snapshot_submission
where
    subject = @subject
order by created_at desc;

-- name: GetDeviceBySubmissionId :many
select
    id,
    integration,
    manufacturer,
    model,
    model_id "modelId"
from
    snapshot_submission_device ssd join snapshot_submission_attribution_device ssad on (
        ssd.id = ssad.snapshot_submission_device_id
    )
where
    ssad.snapshot_submission_id = @submissionId;

-- name: GetDevicePermutationBySubmissionId :many
select
    id,
    snapshot_submission_device_id "deviceId",
    entry_type "entryType",
    has_configuration_url "hasConfigurationUrl",
    version_sw "versionSw",
    version_hw "versionHw"
from
    snapshot_submission_device_permutation ssdp join snapshot_submission_attribution_device_permutation ssadp on (
        ssdp.id = ssadp.snapshot_submission_device_permutation_id
    )
where
    ssadp.snapshot_submission_id = @submissionId;

-- name: GetDevicePermutationLinkBySubmissionId :many
select
    id,
    snapshot_submission_device_permutation_id_parent "parentDevicePermutationId",
    snapshot_submission_device_permutation_id_child "childDevicePermutationId"
from
    snapshot_submission_device_permutation_link ssdpl join snapshot_submission_attribution_device_permutation_link ssadpl on (
        ssdpl.id = ssadpl.snapshot_submission_device_permutation_link_id
    )
where
    ssadpl.snapshot_submission_id = @submissionId;

-- name: GetEntityBySubmissionIdAndIntegration :many
select distinct
    -- when an integrations lists an entity multiple times in the same snapshot, the
    -- entity itself is deduplicated, but integration <-> entity links are not
    -- the join below therefor leads to multiple equivalent entities being returned in that case
    -- the "distinct" deduplicates these additional occurrences
    sse.id,
    domain,
    assumed_state "assumedState",
    has_name "hasName",
    category,
    original_device_class "originalDeviceClass",
    unit_of_measurement "unitOfMeasurement"
from
    snapshot_submission_entity sse join snapshot_submission_entity_integration ssei on (
        sse.id = ssei.snapshot_submission_entity_id
    ) join snapshot_submission_attribution_entity_integration ssaei on (
        ssei.id = ssaei.snapshot_submission_entity_integration_id
    )
where
    ssaei.snapshot_submission_id = @submissionId and
    ssei.integration = @integration;

-- name: GetEntityBySubmissionIdAndDevicePermutationId :many
select distinct
    -- when a device permutation with equivalent entities appears multiple times in the same snapshot, the
    -- entity itself is deduplicated, but device permutation <-> entity links are not
    -- the join below therefor leads to multiple equivalent entities being returned in that case
    -- the "distinct" deduplicates these additional occurrences
    sse.id,
    domain,
    assumed_state "assumedState",
    has_name "hasName",
    category,
    original_device_class "originalDeviceClass",
    unit_of_measurement "unitOfMeasurement"
from
    snapshot_submission_entity sse join snapshot_submission_entity_device_permutation ssedp on (
        sse.id = ssedp.snapshot_submission_entity_id
    ) join snapshot_submission_attribution_entity_device_permutation ssaedp on (
        ssedp.id = ssaedp.snapshot_submission_entity_device_permutation_id
    )
where
    ssaedp.snapshot_submission_id = @submissionId and
    ssedp.snapshot_submission_device_permutation_id = @devicePermutationId;

-- name: GetSubmissionCount :one
select count(*) count from snapshot_submission;

-- name: GetDeviceCount :one
select count(*) count from snapshot_submission_device;

-- name: GetDevicePermutationCount :one
select count(*) count from snapshot_submission_device_permutation;

-- name: GetEntityCount :one
select count(*) count from snapshot_submission_entity;
