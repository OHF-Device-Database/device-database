-- name: GetDerivedMetaEntityStats :many
select
    name,
    pgsize
from
    derived_meta_entity_stat;
