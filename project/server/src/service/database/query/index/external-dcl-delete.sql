-- name: DeleteExternalDclVendor :exec
delete from external_dcl_vendor where vendor_id = @vendorId;

-- name: DeleteExternalDclModel :exec
delete from external_dcl_model where vid = @vid and pid = @pid;

-- name: DeleteExternalDclModelVersionByModel :exec
-- versions don't outlive their model
delete from external_dcl_model_version where vid = @vid and pid = @pid;

-- name: DeleteExternalDclModelVersion :exec
delete from external_dcl_model_version where vid = @vid and pid = @pid and software_version = @softwareVersion;

-- name: DeleteExternalDclCompliance :exec
delete from external_dcl_compliance where vid = @vid and pid = @pid and software_version = @softwareVersion and certification_type = @certificationType;

-- name: DeleteExternalDclVendorAll :exec
delete from external_dcl_vendor;

-- name: DeleteExternalDclModelAll :exec
delete from external_dcl_model;

-- name: DeleteExternalDclModelVersionAll :exec
delete from external_dcl_model_version;

-- name: DeleteExternalDclComplianceAll :exec
delete from external_dcl_compliance;
