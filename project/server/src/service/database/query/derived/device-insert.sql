-- name: InsertDerivedDevices :exec
with filtered_counted_device as (
    select
        ssad.snapshot_submission_device_id id,
        count(distinct ssas.subject) as count
    from
        snapshot_submission_attribution_device ssad join snapshot_submission_attribution_submission ssas on (
            ssad.snapshot_submission_id = ssas.snapshot_submission_id
        )
    where
        ssas.subject in (
            select subject from derived_subject
        )
    group by
        1
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
            snapshot_submission ss join snapshot_submission_attribution_device ssadp on (
                ss.id = ssadp.snapshot_submission_id
            )
        where
            ssadp.snapshot_submission_device_id = ssd.id

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
                version_sw version,
                min((
                    select
                        created_at
                    from
                        snapshot_submission ss join snapshot_submission_attribution_device_permutation ssadp on (
                            ss.id = ssadp.snapshot_submission_id
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
                version_sw != '""'
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
                version_hw version,
                min((
                    select
                        created_at
                    from
                        snapshot_submission ss join snapshot_submission_attribution_device_permutation ssadp on (
                            ss.id = ssadp.snapshot_submission_id
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
                version_hw != '""'
            group by 1
        ) v
    ),
    fcd.count
from
    snapshot_submission_device ssd join filtered_counted_device fcd on (
        ssd.id = fcd.id
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
