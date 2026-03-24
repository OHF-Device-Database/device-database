-- name: GetDerivedDevices :many
select
    id,
    integration,
    manufacturer,
    model,
    model_id "modelId",
    count
from
    derived_device;

-- name: GetDerivedDevice :one
select
    id,
    integration,
    manufacturer,
    model,
    model_id "modelId",
    count
from
    derived_device
where
    id = :id;
