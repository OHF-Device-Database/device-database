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
