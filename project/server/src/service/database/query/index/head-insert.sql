-- name: InsertHeadBrand :exec
insert into head_brand (
    id,
    trait,
    locale,
    value,
    history_hash
)
select
    entity_id,
    trait,
    locale,
    value,
    history_hash
from (
    select
        hc.entity_id,
        hc.trait,
        hc.locale,
        hc.change ->> '$.kind' kind,
        -- arrow operator retains json representation (e.g. strings stay quoted)
        hc.change -> '$.value' value,
        hc.history_hash,
        row_number() over (
            partition by hc.entity_id, hc.trait, hc.locale
            order by h.sequence desc
        ) recency
    from
        history_change_entity hc join history h on (
            hc.history_hash = h.hash
        )
    where
        hc.entity_kind = 'brand'
)
where
    recency = 1 and
    kind != 'removed';

-- name: InsertHeadCategory :exec
insert into head_category (
    name,
    parent,
    trait,
    locale,
    value,
    history_hash
)
select
    entity_id,
    -- strips last path segment, rtrim drops trailing characters until hitting the last slash
    nullif(rtrim(rtrim(entity_id, replace(entity_id, '/', '')), '/'), ''),
    trait,
    locale,
    value,
    history_hash
from (
    select
        hc.entity_id,
        hc.trait,
        hc.locale,
        hc.change ->> '$.kind' kind,
        hc.change -> '$.value' value,
        hc.history_hash,
        row_number() over (
            partition by hc.entity_id, hc.trait, hc.locale
            order by h.sequence desc
        ) recency
    from
        history_change_entity hc join history h on (
            hc.history_hash = h.hash
        )
    where
        hc.entity_kind = 'category'
)
where
    recency = 1 and
    kind != 'removed';

-- name: InsertHeadDevice :exec
insert into head_device (
    id,
    trait,
    locale,
    value,
    history_hash
)
select
    entity_id,
    trait,
    locale,
    value,
    history_hash
from (
    select
        hc.entity_id,
        hc.trait,
        hc.locale,
        hc.change ->> '$.kind' kind,
        hc.change -> '$.value' value,
        hc.history_hash,
        row_number() over (
            partition by hc.entity_id, hc.trait, hc.locale
            order by h.sequence desc
        ) recency
    from
        history_change_entity hc join history h on (
            hc.history_hash = h.hash
        )
    where
        hc.entity_kind = 'device'
)
where
    recency = 1 and
    kind != 'removed';

-- name: InsertHeadTrait :exec
insert into head_trait (
    entity_kind,
    trait,
    locale,
    value,
    history_hash
)
select
    entity_kind,
    trait,
    locale,
    value,
    history_hash
from (
    select
        ht.entity_kind,
        ht.trait,
        ht.locale,
        ht.change ->> '$.kind' kind,
        ht.change -> '$.value' value,
        ht.history_hash,
        row_number() over (
            partition by ht.entity_kind, ht.trait, ht.locale
            order by h.sequence desc
        ) recency
    from
        history_change_trait ht join history h on (
            ht.history_hash = h.hash
        )
)
where
    recency = 1 and
    kind != 'removed';
