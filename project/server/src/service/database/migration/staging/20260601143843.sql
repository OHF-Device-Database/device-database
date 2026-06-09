-- columns were accidentally swapped in previous migration
update snapshot_submission_attribution_submission set hass_version = created_at, created_at = hass_version;
