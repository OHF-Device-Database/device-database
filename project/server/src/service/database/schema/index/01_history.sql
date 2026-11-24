create table history (
    hash text primary key not null,
    -- position along the first-parent chain, commit timestamps don't order reliably
    sequence integer not null unique,
    created_at integer not null
) strict, without rowid;

create table history_change_entity (
    -- synthetic identifier
    id text primary key not null,
    history_hash text not null references history(hash) on delete cascade,
    entity_kind text not null check (entity_kind in ('brand', 'device', 'category')),
    entity_id text not null,
    trait text not null,
    -- bcp 47 tag, null when the trait isn't localized
    locale text,
    -- {"kind": "removed"}, {"kind": "added", "value": <...>}, {"kind": "modified", "value": <...>}
    change text not null check (json_valid(change)),
    -- {"kind": "github", "id": <...>}
    author text check (author is null or json_valid(author)),
    -- {"kind": "database", "value": "csa"}, {"kind": "ha-telemetry"}, {"kind": "inferred"}, {"kind": "community", "url"?: <...>}
    source text not null check (json_valid(source))
) strict, without rowid;

-- unique constraints treat nulls as distinct
create unique index history_change_entity_unique_idx on history_change_entity(
    history_hash,
    entity_kind,
    entity_id,
    trait,
    ifnull(locale, '')
);
create index history_change_entity_entity_idx on history_change_entity(entity_kind, entity_id, trait, locale);
create index history_change_entity_kind_idx on history_change_entity(change ->> '$.kind');
create index history_change_entity_author_idx on history_change_entity(
    author ->> '$.kind',
    author ->> '$.id'
);

-- contents of `traits/<entity>/<trait>/definition.json` (determines how values of a trait are laid out in entities), and its `locale/<lang>.json` siblings
create table history_change_trait (
    -- synthetic identifier
    id text primary key not null,
    history_hash text not null references history(hash) on delete cascade,
    entity_kind text not null check (entity_kind in ('brand', 'device', 'category')),
    trait text not null,
    -- bcp 47 tag of `locale/<lang>.json`, null for `definition.json`
    locale text,
    -- {"kind": "removed"}, {"kind": "added", "value": <...>}, {"kind": "modified", "value": <...>}
    change text not null check (json_valid(change)),
    -- {"kind": "github", "id": <...>}
    author text check (author is null or json_valid(author))
) strict, without rowid;

-- unique constraints treat nulls as distinct
create unique index history_change_trait_unique_idx on history_change_trait(
    history_hash,
    entity_kind,
    trait,
    ifnull(locale, '')
);
create index history_change_trait_entity_idx on history_change_trait(entity_kind, trait, locale);
create index history_change_trait_kind_idx on history_change_trait(change ->> '$.kind');
create index history_change_trait_author_idx on history_change_trait(
    author ->> '$.kind',
    author ->> '$.id'
);
