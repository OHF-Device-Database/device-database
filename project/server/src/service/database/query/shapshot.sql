-- name: InsertSnapshot :one
insert into snapshot (
  id, version, data, contact, created_at
) values (
  ?, ?, ?, ?, @createdAt
)
returning id, version, data, contact, created_at "createdAt";

-- name: GetSnapshot :one
select
    id,
    version,
    data,
    contact,
    created_at "createdAt"
from
    snapshot
where
    id = ?;

-- name: GetUnexpectedSnapshots :many
select
    id,
    data,
    contact,
    created_at "createdAt"
from
    snapshot
where
    version = -1;

-- name: UpdateSnapshotVersion :exec
update snapshot set version = @version where id = @id;
