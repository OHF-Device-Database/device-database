-- name: InsertHistory :exec
insert into history (
    hash,
    sequence,
    created_at
) values (
    @hash,
    @sequence,
    @createdAt
);

-- name: InsertHistoryChangeEntity :exec
insert into history_change_entity (
    id,
    history_hash,
    entity_kind,
    entity_id,
    trait,
    locale,
    change,
    author,
    source
) values (
    @id,
    @historyHash,
    @entityKind,
    @entityId,
    @trait,
    @locale,
    @change,
    @author,
    @source
);

-- name: InsertHistoryChangeTrait :exec
insert into history_change_trait (
    id,
    history_hash,
    entity_kind,
    trait,
    locale,
    change,
    author
) values (
    @id,
    @historyHash,
    @entityKind,
    @trait,
    @locale,
    @change,
    @author
);
