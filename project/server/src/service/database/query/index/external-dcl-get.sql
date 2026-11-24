-- name: GetExternalDclSync :one
select
    height,
    synced_at
from
    external_dcl_sync;
