-- name: GetExportDevices :many
-- derived devices, those already indexed only when @indexed is set
select
    d.id,
    d.integration,
    d.manufacturer,
    d.model,
    d.model_id,
    d.entities,
    d.derived_device_id_canonical
from
    derived_device d
where
    @indexed or not exists (
        select
            1
        from
            head_device hd
        where
            hd.id = d.id
    )
order by
    d.id;

-- name: GetExportBrands :many
-- brands by name, aliased brands last so that the brand aliased to wins on equal names
select
    hb.id,
    hb.value ->> '$' name
from
    head_brand hb
where
    hb.trait = 'name' and
    hb.locale is null
order by
    exists (
        select
            1
        from
            head_brand a
        where
            a.id = hb.id and
            a.trait = 'alias-of'
    ),
    hb.id;

-- name: GetExportTraits :many
select distinct
    entity_kind,
    trait
from
    head_trait;

-- name: GetExportCategories :many
select distinct
    name
from
    head_category;
