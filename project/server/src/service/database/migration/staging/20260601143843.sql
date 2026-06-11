-- columns were accidentally swapped in previous migration
update snapshot_submission_attribution_submission
set
    hass_version = created_at,
    created_at = hass_version
where
    created_at like '2026.%' or
    created_at like '2025.%';
