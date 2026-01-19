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
    snapshot_submission_set_entity_device_permutation sssedp join snapshot_submission_set_content_entity_device_permutation ssscedp on (
        sssedp.id = ssscedp.snapshot_submission_set_entity_device_permutation_id
    ) join snapshot_submission_attribution_set_entity_device_permutation ssasedp on (
        sssedp.id = ssasedp.snapshot_submission_set_entity_device_permutation_id
    ) join snapshot_submission_entity sse on (
        sse.id = ssscedp.snapshot_submission_entity_id
    )
where
    ssasedp.snapshot_submission_id = @submissionId and
    sssedp.snapshot_submission_device_permutation_id = @devicePermutationId;

-- name: GetEntityCompositionByDevicePermutationId :many
select
    count(distinct ssasedp.snapshot_submission_id) "count",
    json_group_array(
        distinct json_object(
        'id', sse.id,
        'domain', domain,
        'assumedState', assumed_state,
        'hasName', has_name,
        'category', category,
        'originalDeviceClass', original_device_class,
        'unitOfMeasurement', unit_of_measurement
        )
    ) "entities"
from
    snapshot_submission_set_entity_device_permutation sssedp join snapshot_submission_set_content_entity_device_permutation ssscedp on (
        sssedp.id = ssscedp.snapshot_submission_set_entity_device_permutation_id
    ) join snapshot_submission_attribution_set_entity_device_permutation ssasedp on (
        sssedp.id = ssasedp.snapshot_submission_set_entity_device_permutation_id
    ) join snapshot_submission_entity sse on (
        sse.id = ssscedp.snapshot_submission_entity_id
    )
where
    sssedp.snapshot_submission_device_permutation_id = @devicePermutationId
group by
    sssedp.id;

-- name: GetSubmissionCount :one
select count(*) count from snapshot_submission;

-- name: GetSubjectCount :one
select count(*) count from (
    select distinct
        subject
    from
        snapshot_submission
);

-- name: GetIntegrationCount :one
select count(*) count from (
    select distinct
        integration
    from
        snapshot_submission_device
);

-- name: GetDeviceCount :one
select count(*) count from snapshot_submission_device;

-- name: GetDevicePermutationCount :one
select count(*) count from snapshot_submission_device_permutation;

-- name: GetEntityCount :one
select count(*) count from snapshot_submission_entity;

-- name: GetSubmissionStateCount :many
select
    count(*) count,
    hass_version "hassVersion",
    'finished' state
from
    snapshot_submission
where
    completed_at is not null
group by 2
union all
select
    count(*) count,
    hass_version "hassVersion",
    'unfinished' state
from
    snapshot_submission
where
    completed_at is null and
    -- consider unfinished if not completed after 60 seconds
    created_at < (unixepoch() - 60)
group by 2
union all
select
    count(*) count,
    hass_version "hassVersion",
    'empty' state
from
    -- not strictly necessary, as device permutation attribution implies device attribution
    -- (unless data integrity was somehow violated)
    snapshot_submission ss left join snapshot_submission_attribution_device ssad on (
        ss.id = ssad.snapshot_submission_id
    ) left join snapshot_submission_attribution_device_permutation ssadp on (
        ss.id = ssadp.snapshot_submission_id
    ) left join snapshot_submission_attribution_entity_integration ssaei on (
        ss.id = ssaei.snapshot_submission_id
    -- also not strictly necessary, as presence of device permutation attribution should exist regardless of entity cardinality
    ) left join snapshot_submission_attribution_set_entity_device_permutation ssasedp on (
        ss.id = ssasedp.snapshot_submission_id
    )
where
    ssad.snapshot_submission_id is null and
    ssadp.snapshot_submission_id is null and
    ssaei.snapshot_submission_id is null and
    ssasedp.snapshot_submission_id is null
group by 2;


-- name: GetDeviceManufacturerAndIntegrationCount :many
select
    count(1) "count",
    integration,
    manufacturer
from
    snapshot_submission_device
group by
    2, 3
order by
    1 desc;

-- name: GetEntityDomainAndOriginalDeviceClassCount :many
select
    count(1) "count",
    domain,
    original_device_class "originalDeviceClass"
from
    snapshot_submission_entity
group by
    2, 3
order by
    1 desc;

-- name: GetDeviceSubmissionCount :many
select
    sc.count,
    integration,
    manufacturer,
    model,
    model_id
from (
    select
        ssad.snapshot_submission_device_id,
        count(distinct ss.subject) "count"
    from
        snapshot_submission_attribution_device ssad join snapshot_submission ss on (
            ssad.snapshot_submission_id = ss.id
        )
    where
        ss.completed_at is not null
    group by
        1
    having
        count(distinct ss.subject) > 5
) sc join snapshot_submission_device ssd on (
    sc.snapshot_submission_device_id = ssd.id
)
order by
    1 desc;
