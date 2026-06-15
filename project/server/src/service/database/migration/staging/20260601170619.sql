-- preflight:begin
pragma foreign_keys=off;
-- preflight:end

-- strict / without rowid was missing from `snapshot_submission_attribution_submission`
create table _snapshot_submission_attribution_submission (
	id text not null primary key,
	snapshot_submission_id text not null references snapshot_submission(id) on delete cascade,
	subject text not null,
	hass_version text not null,
	created_at integer not null
) strict, without rowid;

insert into _snapshot_submission_attribution_submission select * from snapshot_submission_attribution_submission;
drop table snapshot_submission_attribution_submission;
alter table _snapshot_submission_attribution_submission rename to snapshot_submission_attribution_submission;

create index snapshot_submission_attribution_submission_snapshot_submission_id_id_idx on snapshot_submission_attribution_submission(snapshot_submission_id, id);
create index snapshot_submission_attribution_submission_subject_idx on snapshot_submission_attribution_submission(subject);
create index snapshot_submission_attribution_submission_hass_version_idx on snapshot_submission_attribution_submission(hass_version);

-- postflight:begin
pragma foreign_keys=on;
-- postflight:end
