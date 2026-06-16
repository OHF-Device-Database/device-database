-- name: GetDerivedSubmissions :many
select state, count from derived_submission;
