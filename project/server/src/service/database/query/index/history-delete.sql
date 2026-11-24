-- name: DeleteHistorySucceeding :exec
-- changes cascade
delete from history where sequence > @sequence;
