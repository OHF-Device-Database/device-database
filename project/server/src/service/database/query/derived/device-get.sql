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
