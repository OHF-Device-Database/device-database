-- name: GetDerivedDevices :many
with found as (
    select
        id
    from
        derived_device
    where
        case
            when @includeManufacturers is not null then manufacturer in (select value from json_each(@includeManufacturers))
            else true
        end and
        case
            when @excludeManufacturers is not null then manufacturer not in (select value from json_each(@excludeManufacturers))
            else true
        end and
        case
            when @includeIntegrations is not null then integration in (select value from json_each(@includeIntegrations))
            else true
        end and
        case
            when @excludeIntegrations is not null then integration not in (select value from json_each(@excludeIntegrations))
            else true
        end
    intersect
    select * from (
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
)
select
    dd.id,
    integration,
    manufacturer,
    model,
    model_id "modelId",
    first_encountered_at "firstEncounteredAt",
    (
        select json_group_array(
            json_object(
                'version', value->'version',
                'active', value->'active',
                'firstEncounteredAt', value->'first_encountered_at'
            )
        )
        from
            json_each(versions_software)
    ) "versionsSoftware",
    (
        select json_group_array(
            json_object('version', value->'version', 'firstEncounteredAt', value->'first_encountered_at')
        )
        from
            json_each(versions_hardware)
    ) "versionsHardware",
    (
        select json_group_array(
            json_object('domain', value->'domain', 'originalDeviceClass', value->'original_device_class')
        )
        from
            json_each(entities)
    ) entities,
    count
from
    found f join derived_device dd on (
        f.id = dd.id
    )
order by count desc
limit coalesce(@limit, -1)
offset coalesce(@offset, 0);

-- name: GetDerivedDevice :one
select
    id,
    integration,
    manufacturer,
    model,
    model_id "modelId",
    first_encountered_at "firstEncounteredAt",
    (
        select json_group_array(
            json_object(
                'version', value->'version',
                'active', value->'active',
                'firstEncounteredAt', value->'first_encountered_at'
            )
        )
        from
            json_each(versions_software)
    ) "versionsSoftware",
    (
        select json_group_array(
            json_object('version', value->'version', 'firstEncounteredAt', value->'first_encountered_at')
        )
        from
            json_each(versions_hardware)
    ) "versionsHardware",
    (
        select json_group_array(
            json_object('domain', value->'domain', 'originalDeviceClass', value->'original_device_class')
        )
        from
            json_each(entities)
    ) entities,
    count
from
    derived_device
where
    id = @id;

-- name: GetDerivedDevicesManufacturerCount :many
select
    manufacturer,
    count(1) count
from
    derived_device
group by 1
order by 2 desc;
