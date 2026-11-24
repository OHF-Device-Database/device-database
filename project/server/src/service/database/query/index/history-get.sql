-- name: GetHistory :one
select
    hash,
    sequence
from
    history
where
    hash = @hash;

-- name: GetHistoryLatest :one
select
    hash,
    sequence
from
    history
order by
    sequence desc
limit 1;

-- name: GetHistoryTraits :many
-- definitions and localizations as of the commit at @sequence, head_trait only reflects the latest commit
select
    entity_kind,
    trait,
    locale,
    value
from (
    select
        ht.entity_kind,
        ht.trait,
        ht.locale,
        ht.change ->> '$.kind' kind,
        ht.change -> '$.value' value,
        row_number() over (
            partition by ht.entity_kind, ht.trait, ht.locale
            order by h.sequence desc
        ) recency
    from
        history_change_trait ht join history h on (
            ht.history_hash = h.hash
        )
    where
        h.sequence <= @sequence
)
where
    recency = 1 and
    kind != 'removed';
