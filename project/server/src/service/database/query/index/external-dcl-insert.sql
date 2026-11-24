-- name: InsertExternalDclVendor :exec
-- @value is the json object as served by the ledger
insert or replace into external_dcl_vendor (
    vendor_id,
    name,
    company_legal_name,
    company_preferred_name,
    landing_page_url
)
select
    v ->> '$.vendorID',
    nullif(v ->> '$.vendorName', ''),
    nullif(v ->> '$.companyLegalName', ''),
    nullif(v ->> '$.companyPreferredName', ''),
    nullif(v ->> '$.vendorLandingPageURL', '')
from (select @value v);

-- name: InsertExternalDclModel :exec
-- @value is the json object as served by the ledger
insert or replace into external_dcl_model (
    vid,
    pid,
    device_type_id,
    product_name,
    product_label,
    part_number,
    commissioning_custom_flow,
    commissioning_custom_flow_url,
    commissioning_mode_initial_steps_hint,
    commissioning_mode_initial_steps_instruction,
    commissioning_mode_secondary_steps_hint,
    commissioning_mode_secondary_steps_instruction,
    user_manual_url,
    support_url,
    product_url,
    lsf_url,
    lsf_revision,
    enhanced_setup_flow_options,
    enhanced_setup_flow_tc_url,
    enhanced_setup_flow_tc_revision,
    enhanced_setup_flow_tc_digest,
    enhanced_setup_flow_tc_file_size,
    maintenance_url,
    discovery_capabilities_bitmask,
    commissioning_fallback_url,
    icd_user_active_mode_trigger_hint,
    icd_user_active_mode_trigger_instruction,
    factory_reset_steps_hint,
    factory_reset_steps_instruction
)
select
    v ->> '$.vid',
    v ->> '$.pid',
    v ->> '$.deviceTypeId',
    nullif(v ->> '$.productName', ''),
    nullif(v ->> '$.productLabel', ''),
    nullif(v ->> '$.partNumber', ''),
    v ->> '$.commissioningCustomFlow',
    nullif(v ->> '$.commissioningCustomFlowUrl', ''),
    v ->> '$.commissioningModeInitialStepsHint',
    nullif(v ->> '$.commissioningModeInitialStepsInstruction', ''),
    v ->> '$.commissioningModeSecondaryStepsHint',
    nullif(v ->> '$.commissioningModeSecondaryStepsInstruction', ''),
    nullif(v ->> '$.userManualUrl', ''),
    nullif(v ->> '$.supportUrl', ''),
    nullif(v ->> '$.productUrl', ''),
    nullif(v ->> '$.lsfUrl', ''),
    v ->> '$.lsfRevision',
    v ->> '$.enhancedSetupFlowOptions',
    nullif(v ->> '$.enhancedSetupFlowTCUrl', ''),
    v ->> '$.enhancedSetupFlowTCRevision',
    nullif(v ->> '$.enhancedSetupFlowTCDigest', ''),
    v ->> '$.enhancedSetupFlowTCFileSize',
    nullif(v ->> '$.maintenanceUrl', ''),
    v ->> '$.discoveryCapabilitiesBitmask',
    nullif(v ->> '$.commissioningFallbackUrl', ''),
    v ->> '$.icdUserActiveModeTriggerHint',
    nullif(v ->> '$.icdUserActiveModeTriggerInstruction', ''),
    v ->> '$.factoryResetStepsHint',
    nullif(v ->> '$.factoryResetStepsInstruction', '')
from (select @value v);

-- name: InsertExternalDclModelVersion :exec
-- @value is the json object as served by the ledger
insert or replace into external_dcl_model_version (
    vid,
    pid,
    software_version,
    software_version_string,
    cd_version_number,
    firmware_information,
    software_version_valid,
    ota_url,
    ota_file_size,
    ota_checksum,
    ota_checksum_type,
    min_applicable_software_version,
    max_applicable_software_version,
    release_notes_url,
    specification_version
)
select
    v ->> '$.vid',
    v ->> '$.pid',
    v ->> '$.softwareVersion',
    nullif(v ->> '$.softwareVersionString', ''),
    v ->> '$.cdVersionNumber',
    nullif(v ->> '$.firmwareInformation', ''),
    v ->> '$.softwareVersionValid',
    nullif(v ->> '$.otaUrl', ''),
    -- uint64, served as string
    cast(v ->> '$.otaFileSize' as integer),
    nullif(v ->> '$.otaChecksum', ''),
    v ->> '$.otaChecksumType',
    v ->> '$.minApplicableSoftwareVersion',
    v ->> '$.maxApplicableSoftwareVersion',
    nullif(v ->> '$.releaseNotesUrl', ''),
    v ->> '$.specificationVersion'
from (select @value v);

-- name: InsertExternalDclCompliance :exec
-- @value is the json object as served by the ledger
insert or replace into external_dcl_compliance (
    vid,
    pid,
    software_version,
    certification_type,
    software_version_string,
    cd_version_number,
    certification_status,
    date,
    reason,
    history,
    cd_certificate_id,
    certification_route,
    program_type,
    program_type_version,
    compliant_platform_used,
    compliant_platform_version,
    transport,
    family_id,
    supported_clusters,
    os_version,
    parent_child,
    certification_id_of_software_component,
    specification_version
)
select
    v ->> '$.vid',
    v ->> '$.pid',
    v ->> '$.softwareVersion',
    v ->> '$.certificationType',
    nullif(v ->> '$.softwareVersionString', ''),
    v ->> '$.cDVersionNumber',
    v ->> '$.softwareVersionCertificationStatus',
    nullif(v ->> '$.date', ''),
    nullif(v ->> '$.reason', ''),
    v -> '$.history',
    nullif(v ->> '$.cDCertificateId', ''),
    nullif(v ->> '$.certificationRoute', ''),
    nullif(v ->> '$.programType', ''),
    nullif(v ->> '$.programTypeVersion', ''),
    nullif(v ->> '$.compliantPlatformUsed', ''),
    nullif(v ->> '$.compliantPlatformVersion', ''),
    nullif(v ->> '$.transport', ''),
    nullif(v ->> '$.familyId', ''),
    nullif(v ->> '$.supportedClusters', ''),
    nullif(v ->> '$.OSVersion', ''),
    nullif(v ->> '$.parentChild', ''),
    nullif(v ->> '$.certificationIdOfSoftwareComponent', ''),
    v ->> '$.specificationVersion'
from (select @value v);

-- name: InsertExternalDclSync :exec
insert or replace into external_dcl_sync (
    id,
    height,
    synced_at
) values (
    1,
    @height,
    @syncedAt
);
