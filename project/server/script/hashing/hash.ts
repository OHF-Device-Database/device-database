import { createHash } from "node:crypto";

// 9327b128-3fcb-4b8a-9b5d-1f9d31d25a35 (modified to contain malformed "model" / "sw_version" / "hw_version")
const submission = {
	shelly: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: true,
				// sw_version: '"20251208-113603/2.5.5-c74ac636"',
				sw_version: ['"JP24K1"', '"24.12"'],
				//hw_version: '"gen2"',
				hw_version: {
					id: 7.1,
				},
				manufacturer: "Shelly",
				// model: "Shelly Wall Display XL",
				model: 0,
				model_id: "SAWD-3A1XE10EU2",
				via_device: ["fritz", 0],
				entities: [
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "power",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "timestamp",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "problem",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "signal_strength",
						unit_of_measurement: "dBm",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "event",
						has_entity_name: false,
						original_device_class: "button",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "power",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "illuminance",
						unit_of_measurement: "lx",
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "humidity",
						unit_of_measurement: "%",
					},
					{
						assumed_state: false,
						domain: "update",
						has_entity_name: false,
						original_device_class: "firmware",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "restart",
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: true,
				sw_version: '"20260120-145249/1.7.4-gf9878b6"',
				hw_version: '"gen4"',
				manufacturer: "Shelly",
				model: "Shelly 1 Mini Gen4",
				model_id: "S4SW-001X8EU",
				via_device: ["fritz", 0],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "timestamp",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "problem",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "signal_strength",
						unit_of_measurement: "dBm",
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "power",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "update",
						has_entity_name: false,
						original_device_class: "firmware",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "restart",
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [],
	},
	hue: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.122.8"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue Centura spot",
				model_id: "929003809501_02",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.75.1975134020"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue Bridge",
				model_id: "BSB002",
				via_device: ["fritz", 0],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: "switch",
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.122.8"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue filament bulb",
				model_id: "LWO005",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.122.8"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue Centura spot",
				model_id: "929003809501_01",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.122.2"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue Centura spot",
				model_id: "929003809501_01",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"1.122.8"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue Centura spot",
				model_id: "929003809501_03",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"2.77.35"',
				hw_version: null,
				manufacturer: "Signify Netherlands B.V.",
				model: "Hue outdoor motion sensor",
				model_id: "SML004",
				via_device: ["hue", 1],
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "illuminance",
						unit_of_measurement: "lx",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "battery",
						unit_of_measurement: "%",
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "motion",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: "switch",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
				],
			},
		],
		entities: [],
	},
	philips_js: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"-000.000.000.000"',
				hw_version: null,
				manufacturer: "Philips",
				model: "TPN258E",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: true,
						domain: "media_player",
						has_entity_name: false,
						original_device_class: "tv",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "light",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "remote",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [],
	},
	home_connect: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: null,
				hw_version: null,
				manufacturer: "Neff",
				model: "T68TTV4L0",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "number",
						has_entity_name: false,
						original_device_class: "duration",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: null,
				hw_version: null,
				manufacturer: "Neff",
				model: "B54CR31N0",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: "%",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "number",
						has_entity_name: false,
						original_device_class: "duration",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "timestamp",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "select",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [],
	},
	zha: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: null,
				hw_version: null,
				manufacturer: "",
				model: "Generic Zigbee Coordinator (EZSP)",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
				],
			},
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: '"0x0000100e"',
				hw_version: null,
				manufacturer: "SONOFF",
				model: "ZBMINIL2",
				model_id: null,
				via_device: ["zha", 0],
				entities: [
					{
						assumed_state: false,
						domain: "select",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "signal_strength",
						unit_of_measurement: "dBm",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "identify",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "battery",
						unit_of_measurement: "%",
					},
					{
						assumed_state: false,
						domain: "update",
						has_entity_name: false,
						original_device_class: "firmware",
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [],
	},
	cpuspeed: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: false,
				sw_version: null,
				hw_version: null,
				manufacturer: null,
				model: null,
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "frequency",
						unit_of_measurement: "GHz",
					},
				],
			},
		],
		entities: [],
	},
	fritz: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: true,
				sw_version: '"8.02"',
				hw_version: null,
				manufacturer: "FRITZ!",
				model: "FRITZ!Box 5590 Fiber",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "timestamp",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "image",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "data_size",
						unit_of_measurement: "GB",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "data_rate",
						unit_of_measurement: "kB/s",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "update",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "plug",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "update",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "data_rate",
						unit_of_measurement: "kbit/s",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "data_rate",
						unit_of_measurement: "kbit/s",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "restart",
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "button",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "device_tracker",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
			{
				assumed_state: false,
				domain: "switch",
				has_entity_name: false,
				original_device_class: null,
				unit_of_measurement: null,
			},
		],
	},
	vicare: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: true,
				sw_version: null,
				hw_version: null,
				manufacturer: "Viessmann",
				model: "E3 Vitocal 16",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "number",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "K",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "pressure",
						unit_of_measurement: "bar",
					},
					{
						assumed_state: false,
						domain: "number",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "signal_strength",
						unit_of_measurement: "dBm",
					},
					{
						assumed_state: false,
						domain: "number",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "running",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "current",
						unit_of_measurement: "A",
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "pressure",
						unit_of_measurement: "bar",
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "climate",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "power",
						unit_of_measurement: "W",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "water_heater",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: "h",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "energy",
						unit_of_measurement: "kWh",
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: "m³/h",
					},
				],
			},
		],
		entities: [],
	},
	smlight: {
		devices: [
			{
				entry_type: null,
				has_configuration_url: true,
				sw_version: '"core: v3.2.4 / zigbee: 20250220"',
				hw_version: null,
				manufacturer: "SMLIGHT",
				model: "SLZB-06M",
				model_id: null,
				via_device: null,
				entities: [
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "enum",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "timestamp",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: null,
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "data_size",
						unit_of_measurement: "kB",
					},
					{
						assumed_state: false,
						domain: "binary_sensor",
						has_entity_name: false,
						original_device_class: "connectivity",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "sensor",
						has_entity_name: false,
						original_device_class: "temperature",
						unit_of_measurement: "°C",
					},
					{
						assumed_state: false,
						domain: "switch",
						has_entity_name: false,
						original_device_class: "switch",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "update",
						has_entity_name: false,
						original_device_class: "firmware",
						unit_of_measurement: null,
					},
					{
						assumed_state: false,
						domain: "button",
						has_entity_name: false,
						original_device_class: "restart",
						unit_of_measurement: null,
					},
				],
			},
		],
		entities: [],
	},
};

const consistentCompare = (
	a: string | unknown,
	b: string | unknown,
): number => {
	const aNfc = (typeof a === "string" ? a : "").normalize("NFC");
	const bNfc = (typeof b === "string" ? b : "").normalize("NFC");

	// biome-ignore-start lint/style/noNonNullAssertion: c is guaranteed to be single character
	const aCodePoints = Array.from(aNfc, (c) => c.codePointAt(0)!);
	const bCodePoints = Array.from(bNfc, (c) => c.codePointAt(0)!);
	// biome-ignore-end lint/style/noNonNullAssertion: ↑

	const minLen = Math.min(aCodePoints.length, bCodePoints.length);

	for (let i = 0; i < minLen; i++) {
		if (aCodePoints[i] < bCodePoints[i]) {
			return -1;
		}
		if (aCodePoints[i] > bCodePoints[i]) {
			return 1;
		}
	}

	if (aCodePoints.length < bCodePoints.length) {
		return -1;
	}
	if (aCodePoints.length > bCodePoints.length) {
		return 1;
	}

	return 0;
};

const hasher = createHash("sha256");
const encoder = new TextEncoder();
for (const [integration, content] of Object.entries(submission).toSorted(
	(a, b) => consistentCompare(a[0], b[0]),
)) {
	hasher.update(encoder.encode(integration));

	for (const device of content.devices.toSorted(
		(a, b) =>
			consistentCompare(a.manufacturer, b.manufacturer) ||
			consistentCompare(a.model, b.model) ||
			consistentCompare(a.model_id, b.model_id) ||
			consistentCompare(a.sw_version, b.sw_version) ||
			consistentCompare(a.hw_version, b.hw_version),
	)) {
		for (const [key, value] of Object.entries(device).toSorted((a, b) =>
			consistentCompare(a[0], b[0]),
		)) {
			switch (key) {
				case "entry_type":
				case "sw_version":
				case "hw_version":
				case "manufacturer":
				case "model_id":
				case "model":
					if (typeof value !== "string") {
						break;
					}

					hasher.update(encoder.encode(value));
					break;
				case "has_configuration_url":
					if (typeof value !== "boolean") {
						break;
					}

					hasher.update(encoder.encode(value ? "true" : "false"));
					break;
				case "via_device":
					if (
						!(
							Array.isArray(value) &&
							value.length === 2 &&
							typeof value[0] === "string" &&
							typeof value[1] === "number"
						)
					) {
						break;
					}

					hasher.update(encoder.encode(value[0]));
					hasher.update(encoder.encode(String(value[1])));
					break;
			}
		}

		for (const entity of device.entities.toSorted(
			(a, b) =>
				consistentCompare(a.domain, b.domain) ||
				consistentCompare(a.original_device_class, b.original_device_class) ||
				consistentCompare(a.unit_of_measurement, b.unit_of_measurement),
		)) {
			for (const [key, value] of Object.entries(entity).toSorted((a, b) =>
				consistentCompare(a[0], b[0]),
			)) {
				switch (key) {
					case "domain":
					case "entity_category":
					case "original_device_class":
					case "unit_of_measurement":
						if (typeof value !== "string") {
							break;
						}

						hasher.update(encoder.encode(value));
						break;
					case "assumed_state":
					case "has_entity_name":
						if (typeof value !== "boolean") {
							break;
						}

						hasher.update(encoder.encode(value ? "true" : "false"));
						break;
				}
			}
		}
	}
}

console.log(hasher.digest("hex"));
