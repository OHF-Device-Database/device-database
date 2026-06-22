-- name: InsertDerivedDevices :exec
with filtered_deduplicated_attribution_submission as (
    select distinct
        snapshot_submission_id,
        subject
    from
        snapshot_submission_attribution_submission
    where
        subject in (
            select
                subject
            from
                derived_subject
        )
), filtered_deduplicated_submission as materialized (
    select distinct
        snapshot_submission_id
    from
        filtered_deduplicated_attribution_submission
), filtered_deduplicated_dated_submission as materialized (
    select
        ss.id snapshot_submission_id,
        ss.created_at
    from
        filtered_deduplicated_submission fds join snapshot_submission ss on (
            fds.snapshot_submission_id = ss.id
        )
    where
        ss.completed_at is not null
), filtered_counted_device as (
    select
        ssad.snapshot_submission_device_id,
        count(distinct fdas.subject) as count
    from
        filtered_deduplicated_attribution_submission fdas join snapshot_submission_attribution_device ssad on (
            fdas.snapshot_submission_id = ssad.snapshot_submission_id
        )
    group by
        1
), filtered_deduplicated_snapshot_submission_set_entity_device_permutation as (
    select distinct
        ssasedp.snapshot_submission_set_entity_device_permutation_id
    from
        filtered_deduplicated_submission fds join snapshot_submission_attribution_set_entity_device_permutation ssasedp on (
            fds.snapshot_submission_id = ssasedp.snapshot_submission_id
        )
), filtered_entity_device as (
    select distinct
        ssdp.snapshot_submission_device_id snapshot_submission_device_id,
        ssscedp.snapshot_submission_entity_id
    from
        filtered_deduplicated_snapshot_submission_set_entity_device_permutation fdsssedp join snapshot_submission_set_entity_device_permutation sssedp on (
            fdsssedp.snapshot_submission_set_entity_device_permutation_id = sssedp.id
        ) join snapshot_submission_set_content_entity_device_permutation ssscedp on (
            sssedp.id = ssscedp.snapshot_submission_set_entity_device_permutation_id
        ) join snapshot_submission_device_permutation ssdp on (
            sssedp.snapshot_submission_device_permutation_id = ssdp.id
        )
)
insert into derived_device (
    id,
    integration,
    manufacturer,
    model,
    model_id,
    first_encountered_at,
    versions_software,
    versions_hardware,
    entities,
    count
)
select
    ssd.id,
    integration,
    manufacturer,
    model,
    model_id,
    (
        select
            min(created_at)
        from
            filtered_deduplicated_dated_submission fdds join snapshot_submission_attribution_device ssad on (
                fdds.snapshot_submission_id = ssad.snapshot_submission_id
            )
        where
            ssad.snapshot_submission_device_id = ssd.id

    ),
    (
        select
            json_group_array(
                json_object(
                    'version',
                    v.version,
                    'first_encountered_at',
                    v.first_encountered_at
                )
            )
        from (
            select
                case
                    when version_sw like '"%"' then
                        substr(version_sw, 2, length(version_sw) - 2)
                    else
                        version_sw
                end version,
                min((
                    select
                        created_at
                    from
                        filtered_deduplicated_dated_submission fdds join snapshot_submission_attribution_device_permutation ssadp on (
                            fdds.snapshot_submission_id = ssadp.snapshot_submission_id
                        )
                    where
                        ssadp.snapshot_submission_device_permutation_id = ssdp.id
                )) first_encountered_at
            from
                snapshot_submission_device_permutation ssdp
            where
                ssdp.snapshot_submission_device_id = ssd.id and
                version_sw is not null and
                trim(version_sw) != '' and
                version_sw != '""' and
                version_sw != '"None"'
            group by 1
        ) v
    ),
    (
        select
            json_group_array(
                json_object(
                    'version',
                    v.version,
                    'first_encountered_at',
                    v.first_encountered_at
                )
            )
        from (
            select
                case
                    when version_hw like '"%"' then
                        substr(version_hw, 2, length(version_hw) - 2)
                    else
                        version_hw
                end version,
                min((
                    select
                        created_at
                    from
                        filtered_deduplicated_dated_submission fdds join snapshot_submission_attribution_device_permutation ssadp on (
                            fdds.snapshot_submission_id = ssadp.snapshot_submission_id
                        )
                    where
                        ssadp.snapshot_submission_device_permutation_id = ssdp.id
                )) first_encountered_at
            from
                snapshot_submission_device_permutation ssdp
            where
                ssdp.snapshot_submission_device_id = ssd.id and
                version_hw is not null and
                trim(version_hw) != '' and
                version_hw != '""' and
                version_hw != '"None"'
            group by 1
        ) v
    ),
    (
        select
            json_group_array(
                json_object(
                    'domain',
                    e.domain
                )
            )
        from (
            select distinct
                domain
            from
                filtered_entity_device fed join snapshot_submission_entity sse on (
                    fed.snapshot_submission_entity_id = sse.id
                )
            where
                fed.snapshot_submission_device_id = ssd.id
        ) e
    ),
    fcd.count
from
    snapshot_submission_device ssd join filtered_counted_device fcd on (
        ssd.id = fcd.snapshot_submission_device_id
    )
where
    integration not in (
        'apple_tv',
        'braviatv',
        'epson',
        'home_connect',
        'homekit_controller',
        'hue_ble',
        'husqvarna_automower_ble',
        'insteon',
        'iotawatt',
        'isy944',
        'lg_netcast',
        'lg_thinq',
        'litterrobot',
        'neato',
        'phillips_js',
        'roborock',
        'roon',
        'samsungtv',
        'squeezebox',
        'system_bridge',
        'tplink_omada',
        'tuya',
        'unifiiprotect',
        'webmin',
        'xiaomi_miio'
    ) and
    (
        manufacturer is not null and
        trim(manufacturer) != ''
    ) and
    lower(manufacturer) not in (
        'unknown',
        'unknown manufacturer',
        'undefined',
        '(unknown)',
        '?',
        '--'
    ) and
    not (
        (model is null or trim(model) = '') and
        (model_id is null or trim(model_id) = '')
    ) and
    model not like '% Tracked device';
