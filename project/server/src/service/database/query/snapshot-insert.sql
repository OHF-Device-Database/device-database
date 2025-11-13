-- name: UpsertDevice :one
insert into snapshot_submission_device (
    id,
    integration,
    manufacturer,
    model,
    model_id
) values (
    ?,
    ?,
    ?,
    ?,
    @modelId
) on conflict (
    integration,
    coalesce(manufacturer, ''),
    coalesce(model, ''),
    coalesce(model_id, '')
) do update set
    -- no-op so that returning clause always returns a row
    integration = integration
returning
    id,
    integration,
    manufacturer,
    model,
    model_id "modelId";
-- name: InsertAttributionDevice :exec
insert into snapshot_submission_attribution_device (
    snapshot_submission_id,
    snapshot_submission_device_id
) values (
    @submissionId,
    @deviceId
)
-- due to deduplication, a device with the same identifier can appear multiple times
on conflict do nothing;

-- name: UpsertDevicePermutation :one
insert into snapshot_submission_device_permutation (
    id,
    snapshot_submission_device_id,
    entry_type,
    has_configuration_url,
    version_sw,
    version_hw
) values (
    ?,
    @deviceId,
    @entryType,
    @hasConfigurationUrl,
    @versionSw,
    @versionHw
) on conflict (
    snapshot_submission_device_id,
    coalesce(entry_type, ''),
    coalesce(has_configuration_url, -1),
    coalesce(version_sw, ''),
    coalesce(version_hw, '')
) do update set
    -- no-op so that returning clause always returns a row
    snapshot_submission_device_id = snapshot_submission_device_id
returning
    id,
    snapshot_submission_device_id "deviceId",
    entry_type "entryType",
    has_configuration_url "hasConfigurationUrl",
    version_sw "versionSw",
    version_hw "versionHw";
-- name: InsertAttributionDevicePermutation :exec
insert into snapshot_submission_attribution_device_permutation (
    snapshot_submission_id,
    snapshot_submission_device_permutation_id
) values (
    @submissionId,
    @devicePermutationId
)
-- due to deduplication, a device permutation with the same identifier can appear multiple times
on conflict do nothing;

-- name: InsertDevicePermutationLink :one
insert into snapshot_submission_device_permutation_link (
    id,
    snapshot_submission_device_permutation_id_parent,
    snapshot_submission_device_permutation_id_child
) values (
    ?,
    @parentDevicePermutationId,
    @childDevicePermutationId
) on conflict (
    id,
    snapshot_submission_device_permutation_id_parent,
    snapshot_submission_device_permutation_id_child
) do update set
    -- no-op so that returning clause always returns a row
    id = id
returning
    id,
    snapshot_submission_device_permutation_id_parent "parentDevicePermutationId",
    snapshot_submission_device_permutation_id_child "childDevicePermutationId";
-- name: InsertAttributionDevicePermutationLink :exec
insert into snapshot_submission_attribution_device_permutation_link (
    snapshot_submission_id,
    snapshot_submission_device_permutation_link_id
) values (
    @submissionId,
    @devicePermutationLinkId
);
-- not deduplicated, therefor no need for "on conflict" clause

-- name: UpsertEntity :one
insert into snapshot_submission_entity (
    id,
    domain,
    assumed_state,
    has_name,
    category,
    original_device_class,
    unit_of_measurement
) values (
    ?,
    ?,
    @assumedState,
    @hasName,
    ?,
    @originalDeviceClass,
    @unitOfMeasurement
) on conflict (
    domain,
    coalesce(assumed_state, -1),
    has_name,
    coalesce(category, ''),
    coalesce(original_device_class, ''),
    coalesce(unit_of_measurement, '')
) do update set
    -- no-op so that returning clause always returns a row
    domain = domain
returning
    id,
    domain,
    assumed_state "assumedState",
    has_name "hasName",
    category,
    original_device_class "originalDeviceClass",
    unit_of_measurement "unitOfMeasurement";


-- name: InsertEntityIntegration :one
insert into snapshot_submission_entity_integration (
    id,
    snapshot_submission_entity_id,
    integration
) values (
    ?,
    @entityId,
    ?
)
on conflict (
    id,
    snapshot_submission_entity_id,
    integration
) do update set
    id = id
returning
    id,
    snapshot_submission_entity_id "entityId",
    integration;
-- name: InsertAttributionEntityIntegration :exec
insert into snapshot_submission_attribution_entity_integration (
    snapshot_submission_id,
    snapshot_submission_entity_integration_id
) values (
    @submissionId,
    @entityIntegrationId
);
-- not deduplicated, therefor no need for "on conflict" clause

-- name: InsertEntityDevicePermutation :one
insert into snapshot_submission_entity_device_permutation (
    id,
    snapshot_submission_entity_id,
    snapshot_submission_device_permutation_id
) values (
    ?,
    @entityId,
    @devicePermutationId
)
on conflict (
    id,
    snapshot_submission_entity_id,
    snapshot_submission_device_permutation_id
) do update set
    -- no-op so that returning clause always returns a row
    id = id
returning
    id,
    snapshot_submission_entity_id "entityId",
    snapshot_submission_device_permutation_id "devicePermutationId";
-- name: InsertAttributionEntityDevicePermutation :exec
insert into snapshot_submission_attribution_entity_device_permutation (
    snapshot_submission_id,
    snapshot_submission_entity_device_permutation_id
) values (
    @submissionId,
    @entityDevicePermutationId
);
-- not deduplicated, therefor no need for "on conflict" clause
