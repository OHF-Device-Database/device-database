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
-- zigbee alliance distributed compliance ledger, scoped to what the matter specification maps onto
-- https://github.com/zigbee-alliance/distributed-compliance-ledger/blob/master/docs/mapping_against_matter_spec.md
-- the ledger uses empty strings for absent text, stored as null

-- /dcl/vendorinfo/vendors
create table external_dcl_vendor (
    vendor_id integer primary key not null,
    name text,
    company_legal_name text,
    company_preferred_name text,
    landing_page_url text
) strict;

-- /dcl/model/models
create table external_dcl_model (
    vid integer not null,
    pid integer not null,
    device_type_id integer,
    product_name text,
    product_label text,
    part_number text,
    commissioning_custom_flow integer,
    commissioning_custom_flow_url text,
    commissioning_mode_initial_steps_hint integer,
    commissioning_mode_initial_steps_instruction text,
    commissioning_mode_secondary_steps_hint integer,
    commissioning_mode_secondary_steps_instruction text,
    user_manual_url text,
    support_url text,
    product_url text,
    lsf_url text,
    lsf_revision integer,
    enhanced_setup_flow_options integer,
    enhanced_setup_flow_tc_url text,
    enhanced_setup_flow_tc_revision integer,
    enhanced_setup_flow_tc_digest text,
    enhanced_setup_flow_tc_file_size integer,
    maintenance_url text,
    discovery_capabilities_bitmask integer,
    commissioning_fallback_url text,
    icd_user_active_mode_trigger_hint integer,
    icd_user_active_mode_trigger_instruction text,
    factory_reset_steps_hint integer,
    factory_reset_steps_instruction text,
    primary key (vid, pid)
) strict, without rowid;

create index external_dcl_model_device_type_idx on external_dcl_model(device_type_id);

-- /dcl/model/versions/{vid}/{pid}/{softwareVersion}
create table external_dcl_model_version (
    vid integer not null,
    pid integer not null,
    software_version integer not null,
    software_version_string text,
    cd_version_number integer,
    firmware_information text,
    software_version_valid integer,
    ota_url text,
    ota_file_size integer,
    ota_checksum text,
    ota_checksum_type integer,
    min_applicable_software_version integer,
    max_applicable_software_version integer,
    release_notes_url text,
    specification_version integer,
    primary key (vid, pid, software_version)
) strict, without rowid;

-- /dcl/compliance/compliance-info, compliance isn't tied to a model, e.g. zigbee certifications
create table external_dcl_compliance (
    vid integer not null,
    pid integer not null,
    software_version integer not null,
    -- "matter", "zigbee"
    certification_type text not null,
    software_version_string text,
    cd_version_number integer,
    -- 1 provisional, 2 certified, 3 revoked
    certification_status integer,
    -- iso 8601
    date text,
    reason text,
    -- json, [{"softwareVersionCertificationStatus": <...>, "date": <...>, "reason": <...>, "cDVersionNumber": <...>}]
    history text check (history is null or json_valid(history)),
    cd_certificate_id text,
    certification_route text,
    program_type text,
    program_type_version text,
    compliant_platform_used text,
    compliant_platform_version text,
    -- comma-separated, e.g. "wi-fi,bluetooth"
    transport text,
    family_id text,
    supported_clusters text,
    os_version text,
    parent_child text,
    certification_id_of_software_component text,
    specification_version integer,
    primary key (vid, pid, software_version, certification_type)
) strict, without rowid;

create index external_dcl_compliance_cd_certificate_id_idx on external_dcl_compliance(cd_certificate_id);

-- ledger height the tables above reflect, single row
create table external_dcl_sync (
    id integer primary key not null check (id = 1),
    height integer not null,
    synced_at integer not null
) strict;
