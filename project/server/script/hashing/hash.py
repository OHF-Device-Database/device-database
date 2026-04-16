from hashlib import sha256
from unicodedata import normalize
from functools import cmp_to_key

# 9327b128-3fcb-4b8a-9b5d-1f9d31d25a35 (modified to contain malformed "model" / "sw_version" / "hw_version")
submission = {
    "shelly": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": True,
                # "sw_version": "\"20251208-113603/2.5.5-c74ac636\"",
                "sw_version": ['"JP24K1"', '"24.12"'],
                # "hw_version": "\"gen2\"",
                "hw_version": {"id": 7.1},
                "manufacturer": "Shelly",
                # "model": "Shelly Wall Display XL",
                "model": 0,
                "model_id": "SAWD-3A1XE10EU2",
                "via_device": ["fritz", 0],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "power",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "timestamp",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "problem",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "signal_strength",
                        "unit_of_measurement": "dBm",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "event",
                        "has_entity_name": False,
                        "original_device_class": "button",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "power",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "illuminance",
                        "unit_of_measurement": "lx",
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "humidity",
                        "unit_of_measurement": "%",
                    },
                    {
                        "assumed_state": False,
                        "domain": "update",
                        "has_entity_name": False,
                        "original_device_class": "firmware",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "restart",
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": True,
                "sw_version": '"20260120-145249/1.7.4-gf9878b6"',
                "hw_version": '"gen4"',
                "manufacturer": "Shelly",
                "model": "Shelly 1 Mini Gen4",
                "model_id": "S4SW-001X8EU",
                "via_device": ["fritz", 0],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "timestamp",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "problem",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "signal_strength",
                        "unit_of_measurement": "dBm",
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "power",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "update",
                        "has_entity_name": False,
                        "original_device_class": "firmware",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "restart",
                        "unit_of_measurement": None,
                    },
                ],
            },
        ],
        "entities": [],
    },
    "hue": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.122.8"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue Centura spot",
                "model_id": "929003809501_02",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.75.1975134020"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue Bridge",
                "model_id": "BSB002",
                "via_device": ["fritz", 0],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": "switch",
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.122.8"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue filament bulb",
                "model_id": "LWO005",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.122.8"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue Centura spot",
                "model_id": "929003809501_01",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.122.2"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue Centura spot",
                "model_id": "929003809501_01",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"1.122.8"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue Centura spot",
                "model_id": "929003809501_03",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"2.77.35"',
                "hw_version": None,
                "manufacturer": "Signify Netherlands B.V.",
                "model": "Hue outdoor motion sensor",
                "model_id": "SML004",
                "via_device": ["hue", 1],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "illuminance",
                        "unit_of_measurement": "lx",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "battery",
                        "unit_of_measurement": "%",
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "motion",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": "switch",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                ],
            },
        ],
        "entities": [],
    },
    "philips_js": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"-000.000.000.000"',
                "hw_version": None,
                "manufacturer": "Philips",
                "model": "TPN258E",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": True,
                        "domain": "media_player",
                        "has_entity_name": False,
                        "original_device_class": "tv",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "light",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "remote",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                ],
            }
        ],
        "entities": [],
    },
    "home_connect": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": None,
                "hw_version": None,
                "manufacturer": "Neff",
                "model": "T68TTV4L0",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "number",
                        "has_entity_name": False,
                        "original_device_class": "duration",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": None,
                "hw_version": None,
                "manufacturer": "Neff",
                "model": "B54CR31N0",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": "%",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "number",
                        "has_entity_name": False,
                        "original_device_class": "duration",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "timestamp",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "select",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": None,
                    },
                ],
            },
        ],
        "entities": [],
    },
    "zha": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": None,
                "hw_version": None,
                "manufacturer": "",
                "model": "Generic Zigbee Coordinator (EZSP)",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    }
                ],
            },
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": '"0x0000100e"',
                "hw_version": None,
                "manufacturer": "SONOFF",
                "model": "ZBMINIL2",
                "model_id": None,
                "via_device": ["zha", 0],
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "select",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "signal_strength",
                        "unit_of_measurement": "dBm",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "identify",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "battery",
                        "unit_of_measurement": "%",
                    },
                    {
                        "assumed_state": False,
                        "domain": "update",
                        "has_entity_name": False,
                        "original_device_class": "firmware",
                        "unit_of_measurement": None,
                    },
                ],
            },
        ],
        "entities": [],
    },
    "cpuspeed": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": False,
                "sw_version": None,
                "hw_version": None,
                "manufacturer": None,
                "model": None,
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "frequency",
                        "unit_of_measurement": "GHz",
                    }
                ],
            }
        ],
        "entities": [],
    },
    "fritz": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": True,
                "sw_version": '"8.02"',
                "hw_version": None,
                "manufacturer": "FRITZ!",
                "model": "FRITZ!Box 5590 Fiber",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "timestamp",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "image",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "data_size",
                        "unit_of_measurement": "GB",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "data_rate",
                        "unit_of_measurement": "kB/s",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "update",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "plug",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "update",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "data_rate",
                        "unit_of_measurement": "kbit/s",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "data_rate",
                        "unit_of_measurement": "kbit/s",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "restart",
                        "unit_of_measurement": None,
                    },
                ],
            }
        ],
        "entities": [
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "button",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "device_tracker",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
            {
                "assumed_state": False,
                "domain": "switch",
                "has_entity_name": False,
                "original_device_class": None,
                "unit_of_measurement": None,
            },
        ],
    },
    "vicare": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": True,
                "sw_version": None,
                "hw_version": None,
                "manufacturer": "Viessmann",
                "model": "E3 Vitocal 16",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "number",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "K",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "pressure",
                        "unit_of_measurement": "bar",
                    },
                    {
                        "assumed_state": False,
                        "domain": "number",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "signal_strength",
                        "unit_of_measurement": "dBm",
                    },
                    {
                        "assumed_state": False,
                        "domain": "number",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "running",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "current",
                        "unit_of_measurement": "A",
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "pressure",
                        "unit_of_measurement": "bar",
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "climate",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "power",
                        "unit_of_measurement": "W",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "water_heater",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": "h",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "energy",
                        "unit_of_measurement": "kWh",
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": "m³/h",
                    },
                ],
            }
        ],
        "entities": [],
    },
    "smlight": {
        "devices": [
            {
                "entry_type": None,
                "has_configuration_url": True,
                "sw_version": '"core: v3.2.4 / zigbee: 20250220"',
                "hw_version": None,
                "manufacturer": "SMLIGHT",
                "model": "SLZB-06M",
                "model_id": None,
                "via_device": None,
                "entities": [
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "enum",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "timestamp",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": None,
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "data_size",
                        "unit_of_measurement": "kB",
                    },
                    {
                        "assumed_state": False,
                        "domain": "binary_sensor",
                        "has_entity_name": False,
                        "original_device_class": "connectivity",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "sensor",
                        "has_entity_name": False,
                        "original_device_class": "temperature",
                        "unit_of_measurement": "°C",
                    },
                    {
                        "assumed_state": False,
                        "domain": "switch",
                        "has_entity_name": False,
                        "original_device_class": "switch",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "update",
                        "has_entity_name": False,
                        "original_device_class": "firmware",
                        "unit_of_measurement": None,
                    },
                    {
                        "assumed_state": False,
                        "domain": "button",
                        "has_entity_name": False,
                        "original_device_class": "restart",
                        "unit_of_measurement": None,
                    },
                ],
            }
        ],
        "entities": [],
    },
}


def consistent_compare(a: str | object, b: str | object):
    a_nfc = normalize("NFC", a if type(a) is str else "")
    b_nfc = normalize("NFC", b if type(b) is str else "")

    a_nfc_codepoints = [ord(c) for c in a_nfc]
    b_nfc_codepoints = [ord(c) for c in b_nfc]

    min_len = min(len(a_nfc_codepoints), len(b_nfc_codepoints))

    for i in range(min_len):
        if a_nfc_codepoints[i] < b_nfc_codepoints[i]:
            return -1
        if a_nfc_codepoints[i] > b_nfc_codepoints[i]:
            return 1

    if len(a_nfc_codepoints) < len(b_nfc_codepoints):
        return -1
    if len(a_nfc_codepoints) > len(b_nfc_codepoints):
        return 1

    return 0


hasher = sha256()
for integration, content in sorted(
    submission.items(),
    key=cmp_to_key(lambda a, b: consistent_compare(a[0], b[0])),
):
    hasher.update(integration.encode("utf-8"))

    for device in sorted(
        content["devices"],
        key=cmp_to_key(
            lambda a, b: consistent_compare(a["manufacturer"], b["manufacturer"])
            or consistent_compare(a["model"], b["model"])
            or consistent_compare(a["model_id"], b["model_id"])
            or consistent_compare(a["sw_version"], b["sw_version"])
            or consistent_compare(a["hw_version"], b["hw_version"])
        ),
    ):
        for key, value in sorted(
            device.items(), key=cmp_to_key(lambda a, b: consistent_compare(a[0], b[0]))
        ):
            match key:
                case (
                    "entry_type"
                    | "sw_version"
                    | "hw_version"
                    | "manufacturer"
                    | "model_id"
                    | "model"
                ):
                    if type(value) is str:

                        hasher.update(value.encode("utf-8"))

                case "has_configuration_url":
                    if type(value) is bool:

                        hasher.update(("true" if value else "false").encode("utf-8"))

                case "via_device":
                    if (
                        type(value) is list
                        and len(value) == 2
                        and type(value[0]) is str
                        and type(value[1]) is int
                    ):
                        hasher.update(value[0].encode("utf-8"))

                        hasher.update(str(value[1]).encode("utf-8"))

        for entity in sorted(
            device["entities"],
            key=cmp_to_key(
                lambda a, b: consistent_compare(a["domain"], b["domain"])
                or consistent_compare(
                    a["original_device_class"], b["original_device_class"]
                )
                or consistent_compare(
                    a["unit_of_measurement"], b["unit_of_measurement"]
                )
            ),
        ):
            for key, value in sorted(
                entity.items(),
                key=cmp_to_key(lambda a, b: consistent_compare(a[0], b[0])),
            ):
                match key:
                    case (
                        "domain"
                        | "entity_category"
                        | "original_device_class"
                        | "unit_of_measurement"
                    ):
                        if type(value) is str:
                            hasher.update(value.encode("utf-8"))

                    case "assumed_state" | "has_entity_name":
                        if type(value) is bool:
                            hasher.update(
                                ("true" if value else "false").encode("utf-8")
                            )


print(hasher.hexdigest())
