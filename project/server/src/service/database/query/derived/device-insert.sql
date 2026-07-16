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
), filtered_device as materialized (
    select
        ssd.*
    from
        snapshot_submission_device ssd
    where
        ssd.integration not in (
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
            ssd.manufacturer is not null and
            trim(ssd.manufacturer) != ''
        ) and
        lower(ssd.manufacturer) not in (
            'unknown',
            'unknown manufacturer',
            'undefined',
            '(unknown)',
            '?',
            '--'
        ) and
        -- exclude tuya for insufficient data quality
        ssd.manufacturer not like '_T%' and
        not (
            (ssd.model is null or trim(ssd.model) = '') and
            (ssd.model_id is null or trim(ssd.model_id) = '')
        ) and
        ssd.model not like '% Tracked device'
), filtered_counted_device as materialized (
    select
        ssad.snapshot_submission_device_id,
        count(distinct fdas.subject) count
    from
        filtered_deduplicated_attribution_submission fdas join snapshot_submission_attribution_device ssad on (
            fdas.snapshot_submission_id = ssad.snapshot_submission_id
        )
    where
        ssad.snapshot_submission_device_id in (
            select
                fd.id
            from
                filtered_device fd
        )
    group by 1
    having
        count(distinct fdas.subject) >= 5
), filtered_device_permutation as materialized (
   select
       ssdp.id snapshot_submission_device_permutation_id
   from
        filtered_counted_device fcp join snapshot_submission_device_permutation ssdp on (
            fcp.snapshot_submission_device_id = ssdp.snapshot_submission_device_id
        )
), filtered_counted_most_recent_submission as (
    -- how often submission appears as most recent submission by subjects
    select
        l.snapshot_submission_id,
        count(1) count
    from
        derived_subject ds join (
            select
                subject,
                -- https://www.sqlite.org/lang_select.html#bare_columns_in_an_aggregate_query
                snapshot_submission_id,
                max(created_at)
            from
                snapshot_submission_attribution_submission ssas
            group by
                1
        ) l on (
            ds.subject = l.subject
        )
    group by
        1
), filtered_counted_active_device_permutation as materialized (
    select
        ssadp.snapshot_submission_device_permutation_id,
        sum(fcmrs.count) count
    from
        filtered_counted_most_recent_submission fcmrs join snapshot_submission_attribution_device_permutation ssadp on (
            fcmrs.snapshot_submission_id = ssadp.snapshot_submission_id
        )
    where
        ssadp.snapshot_submission_device_permutation_id in (
            select
                fdp.snapshot_submission_device_permutation_id
            from
                filtered_device_permutation fdp
        )
    group by
        1
), filtered_deduplicated_submission as (
    select distinct
        snapshot_submission_id
    from
        filtered_deduplicated_attribution_submission
), filtered_deduplicated_dated_submission as (
    select
        ss.id snapshot_submission_id,
        ss.created_at
    from
        filtered_deduplicated_submission fds join snapshot_submission ss on (
            fds.snapshot_submission_id = ss.id
        )
    where
        ss.completed_at is not null
), scoped_snapshot_submission_attribution_set_entity_device_permutation as materialized (
    -- using distinct here results in use of non-covering index (snapshot_submission_id), causing expensive non-sequential reads
    -- faster to materialize more rows and deduplicate later on
    select
        ssasedp.snapshot_submission_id,
        ssasedp.snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_attribution_set_entity_device_permutation ssasedp
), filtered_deduplicated_snapshot_submission_attribution_set_entity_device_permutation as materialized (
    select distinct
        sssasedp.snapshot_submission_set_entity_device_permutation_id
    from
        scoped_snapshot_submission_attribution_set_entity_device_permutation sssasedp
    where
        sssasedp.snapshot_submission_id in (
            select
                fds.snapshot_submission_id
            from
                filtered_deduplicated_submission fds
        )
), filtered_deduplicated_snapshot_submission_set_entity_device_permutation as materialized (
    select
        sssedp.id as snapshot_submission_set_entity_device_permutation_id
    from
        snapshot_submission_set_entity_device_permutation sssedp
    where
        sssedp.snapshot_submission_device_permutation_id in (
            select
                fdp.snapshot_submission_device_permutation_id
            from
                filtered_device_permutation fdp
        )
    intersect
    select
        fdssasedp.snapshot_submission_set_entity_device_permutation_id
    from
        filtered_deduplicated_snapshot_submission_attribution_set_entity_device_permutation fdssasedp
), filtered_entity_device as materialized (
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
                    'active',
                    v.active,
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
                sum((
                    select
                        fcadp.count
                    from
                        filtered_counted_active_device_permutation fcadp
                    where
                        fcadp.snapshot_submission_device_permutation_id = ssdp.id
                )) active,
                min((
                    select
                        created_at
                    from
                        filtered_deduplicated_dated_submission fdds join snapshot_submission_attribution_device_permutation ssadp on (
                            ssadp.snapshot_submission_id = fdds.snapshot_submission_id
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
                version_sw != '"None"' and
                version_sw != '"0"'
            group by
                1
        ) v
        where
            v.active is not null and
            v.first_encountered_at is not null
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
                version_hw != '"None"' and
                version_hw != '"0"'
            group by 1
        ) v
        where
            v.first_encountered_at is not null
    ),
    (
        select
            json_group_array(
                json_object(
                    'domain',
                    e.domain,
                    'original_device_class',
                    e.original_device_class
                )
            )
        from (
            select distinct
                domain,
                case
                    when original_device_class in (
                        'absolute_humidity',
                        'apparent_power',
                        'aqi',
                        'area',
                        'atmospheric_pressure',
                        'awning',
                        'battery',
                        'battery_charging',
                        'blind',
                        'blood_glucose_concentration',
                        'button',
                        'carbon_dioxide',
                        'carbon_monoxide',
                        'cold',
                        'conductivity',
                        'connectivity',
                        'current',
                        'curtain',
                        'damper',
                        'data_rate',
                        'data_size',
                        'date',
                        'daylight',
                        'dehumidifier',
                        'distance',
                        'door',
                        'doorbell',
                        'duration',
                        'emitter',
                        'energy',
                        'energy_storage',
                        'enum',
                        'firmware',
                        'frequency',
                        'garage',
                        'garage_door',
                        'gas',
                        'gate',
                        'heat',
                        'humidifier',
                        'humidity',
                        'identify',
                        'illuminance',
                        'input',
                        'irradiance',
                        'light',
                        'lock',
                        'min',
                        'moisture',
                        'monetary',
                        'motion',
                        'moving',
                        'nitrogen_dioxide',
                        'occupancy',
                        'opening',
                        'outlet',
                        'output',
                        'ozone',
                        'ph',
                        'plug',
                        'pm1',
                        'pm10',
                        'pm25',
                        'pm4',
                        'power',
                        'power_factor',
                        'precipitation',
                        'precipitation_intensity',
                        'presence',
                        'pressure',
                        'reactive_energy',
                        'reactive_power',
                        'receiver',
                        'restart',
                        'running',
                        'sabotage',
                        'safety',
                        'shade',
                        'shutter',
                        'signal_strength',
                        'sirene',
                        'smoke',
                        'sound',
                        'sound_pressure',
                        'speaker',
                        'speed',
                        'sulphur_dioxide',
                        'switch',
                        'tamper',
                        'temperature',
                        'temperature_delta',
                        'timestamp',
                        'tv',
                        'update',
                        'uptime',
                        'vibration',
                        'volatile_organic_compounds',
                        'volatile_organic_compounds_parts',
                        'voltage',
                        'volume',
                        'volume_flow_rate',
                        'volume_storage',
                        'water',
                        'weight',
                        'wind_direction',
                        'wind_speed',
                        'window'
                    ) then original_device_class
                    else null
            end original_device_class
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
    filtered_counted_device fcd join snapshot_submission_device ssd on (
        fcd.snapshot_submission_device_id = ssd.id
    );
