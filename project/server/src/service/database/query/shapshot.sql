-- name: InsertSnapshot :one
insert into snapshot (
  id, version, data, contact, created_at
) values (
  ?, ?, ?, ?, @createdAt
)
returning *;
