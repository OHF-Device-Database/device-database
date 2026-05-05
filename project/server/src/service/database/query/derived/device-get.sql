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

-- name: GetDerivedDevicesBySearchTerm :many
with found as (
    select
        id
    from
        derived_device dd
    where
        dd.manufacturer like :term escape '\\'
    union
    select
        id
    from
        derived_device dd
    where
        dd.model is not null and
        dd.model like :term escape '\\'
    union
    select
        id
    from
        derived_device dd
    where
        dd.model_id is not null and
        dd.model_id like :term escape '\\'
)
select
    dd.id,
    dd.integration,
    dd.manufacturer,
    dd.model,
    dd.model_id "modelId",
    dd.count
from
    derived_device dd join found f on (dd.id = f.id);
