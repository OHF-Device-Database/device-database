-- name: GetDerivedSubmissions :many
select hass_version "hassVersion", state, count from derived_submission;
