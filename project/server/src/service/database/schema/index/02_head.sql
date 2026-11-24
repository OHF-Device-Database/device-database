-- head tables keep a rowid, primary key columns of strict tables can't hold the null locale

create table head_brand (
    id text not null,
    trait text not null,
    -- null when the trait isn't localized
    locale text,
    -- json
    value text not null,
    -- commit of the change that last set the trait, i.e. history_change_entity(history_hash, entity_kind, entity_id, trait, locale)
    history_hash text not null references history(hash)
) strict;

create unique index head_brand_unique_idx on head_brand(id, trait, ifnull(locale, ''));
create index head_brand_trait_value_idx on head_brand(trait, value);
create index head_brand_history_hash_idx on head_brand(history_hash);

create table head_category (
    -- slash-separated path of nested category names, e.g. `climate-control/fan`
    name text not null,
    -- no foreign key, rows are per trait → `name` alone isn't unique. by convention every category carries at least one trait, so a parent always has rows
    parent text,
    trait text not null,
    -- null when the trait isn't localized
    locale text,
    -- json
    value text not null,
    -- commit of the change that last set the trait, i.e. history_change_entity(history_hash, entity_kind, entity_id, trait, locale)
    history_hash text not null references history(hash)
) strict;

create unique index head_category_unique_idx on head_category(name, trait, ifnull(locale, ''));
create index head_category_parent_idx on head_category(parent);
create index head_category_trait_value_idx on head_category(trait, value);
create index head_category_history_hash_idx on head_category(history_hash);

create table head_device (
    id text not null,
    trait text not null,
    -- null when the trait isn't localized
    locale text,
    -- json
    value text not null,
    -- commit of the change that last set the trait, i.e. history_change_entity(history_hash, entity_kind, entity_id, trait, locale)
    history_hash text not null references history(hash)
) strict;

create unique index head_device_unique_idx on head_device(id, trait, ifnull(locale, ''));
create index head_device_trait_value_idx on head_device(trait, value);
create index head_device_history_hash_idx on head_device(history_hash);

create table head_trait (
    entity_kind text not null,
    trait text not null,
    -- bcp 47 tag of `locale/<lang>.json`, null for `definition.json`
    locale text,
    -- json, trait definition / localized strings
    value text not null,
    -- commit of the change that last set the definition / strings, i.e. history_change_trait(history_hash, entity_kind, trait, locale)
    history_hash text not null references history(hash)
) strict;

create unique index head_trait_unique_idx on head_trait(entity_kind, trait, ifnull(locale, ''));
create index head_trait_history_hash_idx on head_trait(history_hash);
