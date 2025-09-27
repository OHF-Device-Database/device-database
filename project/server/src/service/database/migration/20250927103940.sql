create view snapshot_device_v0 as
select
    value->>'integration' "integration",
    value->>'manufacturer' manufacturer,
    value->>'model_id' "modelId",
    value->>'model' model,
    value->>'sw_version' "swVersion",
    value->>'hw_version' "hwVersion",
    value->>'has_configuration_url' "hasConfigurationUrl",
    value->>'via_device' "viaDevice",
    value->>'entry_type' "entryType",
    value->>'is_custom_integration' "isCustomIntegration"
from
    snapshot s, json_each(s.data, '$.devices')
where
    s.version = 0;

create view snapshot_device_v1 as
with device_v1_integration as (
    select
        key integration,
        json_extract(value, '$.devices') devices,
        json_extract(value, '$.is_custom_integration') "isCustomIntegration"
    from
        snapshot s, json_each(s.data, '$.integrations')
    where
        s.version = 1
)
select
    integration,
    value->>'manufacturer' manufacturer,
    value->>'model_id' "modelId",
    value->>'model' model,
    value->>'sw_version' "swVersion",
    value->>'hw_version' "hwVersion",
    value->>'has_configuration_url' "hasConfigurationUrl",
    value->>'via_device' "viaDevice",
    value->>'entry_type' "entryType",
    "isCustomIntegration"
from
    device_v1_integration d, json_each(d.devices, '$');

create view snapshot_device_v2 as
with device_v2_integration as (
    select
        key integration,
        json_extract(value, '$.devices') devices
    from
        snapshot s, json_each(s.data, '$.integrations')
    where
        s.version = 2
)
select
    integration,
    value->>'manufacturer' manufacturer,
    value->>'model_id' "modelId",
    value->>'model' model,
    value->>'sw_version' "swVersion",
    value->>'hw_version' "hwVersion",
    value->>'has_configuration_url' "hasConfigurationUrl",
    value->>'via_device' "viaDevice",
    value->>'entry_type' "entryType",
    null "isCustomIntegration"
from
    device_v2_integration d, json_each(d.devices, '$');

create view snapshot_device as
select * from snapshot_device_v0
union all
select * from snapshot_device_v1
union all
select * from snapshot_device_v2;

create view snapshot_device_entity_v1 as
with device_v1_integration as (
    select
        key integration,
        json_extract(value, '$.devices') devices,
        json_extract(value, '$.is_custom_integration') "isCustomIntegration"
    from
        snapshot s, json_each(s.data, '$.integrations')
    where
        s.version = 1
), device_v1 as (
    select
        integration,
        value->>'manufacturer' manufacturer,
        value->>'model_id' "modelId",
        value->>'model' model,
        value->>'sw_version' "swVersion",
        value->>'hw_version' "hwVersion",
        value->>'has_configuration_url' "hasConfigurationUrl",
        value->>'via_device' "viaDevice",
        value->>'entry_type' "entryType",
        "isCustomIntegration",
        value->>'entities' entities
    from
        device_v1_integration d, json_each(d.devices, '$')
)
select
    integration,
    modelId,
    model,
    "swVersion",
    "hwVersion",
    "hasConfigurationUrl",
    "viaDevice",
    "isCustomIntegration",
    value->>'assumed_state' "assumedState",
    value->>'capabilities' "capabilities",
    value->>'domain' "domain",
    value->>'entity_category' "entityCategory",
    value->>'has_entity_name' "hasEntityName",
    value->>'modified_by_integration' "modifiedByIntegration",
    value->>'original_device_class' "originalDeviceClass",
    value->>'unit_of_measurement' "unitOfMeasurement"
from
    device_v1 d, json_each(d.entities, '$');

create view snapshot_device_entity_v2 as
with device_v2_integration as (
    select
        key integration,
        json_extract(value, '$.devices') devices
    from
        snapshot s, json_each(s.data, '$.integrations')
    where
        s.version = 2
), device_v2 as (
    select
        integration,
        value->>'manufacturer' manufacturer,
        value->>'model_id' "modelId",
        value->>'model' model,
        value->>'sw_version' "swVersion",
        value->>'hw_version' "hwVersion",
        value->>'has_configuration_url' "hasConfigurationUrl",
        value->>'via_device' "viaDevice",
        value->>'entry_type' "entryType",
        value->>'entities' entities
    from
        device_v2_integration d, json_each(d.devices, '$')
)
select
    integration,
    modelId,
    model,
    "swVersion",
    "hwVersion",
    "hasConfigurationUrl",
    "viaDevice",
    null "isCustomIntegration",
    value->>'assumed_state' "assumedState",
    value->>'capabilities' "capabilities",
    value->>'domain' "domain",
    value->>'entity_category' "entityCategory",
    value->>'has_entity_name' "hasEntityName",
    value->>'modified_by_integration' "modifiedByIntegration",
    value->>'original_device_class' "originalDeviceClass",
    value->>'unit_of_measurement' "unitOfMeasurement"
from
    device_v2 d, json_each(d.entities, '$');

create view snapshot_device_entity as
select * from snapshot_device_entity_v1
union all
select * from snapshot_device_entity_v2;
