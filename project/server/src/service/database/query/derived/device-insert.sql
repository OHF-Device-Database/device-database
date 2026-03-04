-- name: InsertDerivedDevices :exec
with filtered_counted_device as (
    select
        ssd.id,
        count(distinct ss.subject) as count
    from
        snapshot_submission_device ssd join snapshot_submission_attribution_device ssad on (
            ssd.id = ssad.snapshot_submission_device_id
        ) join snapshot_submission ss on (
            ssad.snapshot_submission_id = ss.id
        )
    where
        ss.subject in (
            select subject from derived_subject
        )
    group by
        1
)
insert into derived_device select
    ssd.id,
    integration,
    manufacturer,
    model,
    model_id,
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
        manufacturer is not null or
        trim(manufacturer) = ''
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
