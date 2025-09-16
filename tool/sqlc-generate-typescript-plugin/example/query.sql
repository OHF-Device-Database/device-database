-- name: GetSnapshot :one
select
    *
from snapshot
where
    id = @id
limit 1;

-- name: GetSnapshotsByContact :many
select
    *
from
    snapshot
where
    lower(contact) = @contact;


-- name: InsertSnapshot :exec
insert into snapshot (
    id,
    data,
    contact,
    created_at
) values (
    @id,
    @data,
    @contact,
    @createdAt
);

-- name: UpsertSnapshot :exec
insert into snapshot (
    id,
    data,
    contact,
    created_at
) values (
    @id,
    @data,
    @contact,
    @createdAt
)
on conflict (id)
do update set data = excluded.data, contact = excluded.contact;

-- name: InsertSnapshotReturning :many
insert into snapshot (
    id,
    data,
    contact,
    created_at
) values (
    @id,
    @data,
    @contact,
    @createdAt
)
returning *;

-- `narg` is currently broken: https://github.com/sqlc-dev/sqlc/issues/3785
/*
-- name: InsertSnapshots :exec
insert into snapshot (
    id,
    data,
    contact,
    created_at
)
select
    id,
    data,
    contact,
    created_at
from
    json_each(sqlc.narg("snapshots"));
*/

-- name: DeleteSnapshot :exec
delete from snapshot
where id = @id;
