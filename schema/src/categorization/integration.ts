import { glob, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";

const args = parseArgs({
	options: {
		"core-directory": { type: "string", default: "core" },
		"categories-file": { type: "string", default: "categories.json" },
		out: { type: "string", default: "out/derived.json" },
	},
});

const {
	values: {
		"core-directory": coreDirectory,
		"categories-file": categoriesFile,
		out,
	},
} = args;

const categoryIdentifiers: Set<string> = new Set();
{
	type Category = {
		name: string;
		children: Record<string, Category>;
	};
	const parsed: Record<string, Category> = JSON.parse(
		await readFile(categoriesFile, "utf-8"),
	);

	const visit = (children: Record<string, Category>) => {
		for (const [id, category] of Object.entries(children)) {
			categoryIdentifiers.add(id);
			visit(category.children);
		}
	};

	visit(parsed);
}

/** canonical ha categories, as published by core */
const haCategoryIdentifiers: Set<string> = new Set();
{
	type HaCategory = {
		slug: string;
		subcategories?: { slug: string }[];
	};
	const parsed: HaCategory[] = JSON.parse(
		await readFile(
			join(
				coreDirectory,
				"homeassistant",
				"generated",
				"integration_categories.json",
			),
			"utf-8",
		),
	);

	for (const category of parsed) {
		haCategoryIdentifiers.add(category.slug);
		for (const subcategory of category.subcategories ?? []) {
			haCategoryIdentifiers.add(`${category.slug}.${subcategory.slug}`);
		}
	}
}

/** ha categories that don't aid in classification */
const haCategoryFilter = [
	// software and cloud services, never bound to a physical device
	"ai_voice",
	"ai_voice.ai_models",
	"ai_voice.image_recognition",
	"ai_voice.speech",
	"ai_voice.voice_assistants",
	"computers_network.cloud_developer_tools",
	"computers_network.monitoring",
	"diy_makers.web_data_connectors",
	"energy.energy_prices",
	"finance",
	"helpers",
	"helpers.calculate_value",
	"helpers.store_value",
	"local_services",
	"media_entertainment.music_radio_services",
	"messaging_notifications",
	"messaging_notifications.chat_apps",
	"messaging_notifications.email_sms_calls",
	"messaging_notifications.push_notifications",
	"news_social_media",
	"other_ecosystems",
	"productivity_information",
	"productivity_information.calendars_todos",
	"productivity_information.documents_photos",
	"productivity_information.shopping_groceries",
	"vehicles_transport.flights",
	"vehicles_transport.public_transport",
	"weather_alerts.public_warnings",
];

/** ha categories for which accurate mapping to category hierarchy can be performed */
const haCategoryMapping: [pattern: Set<string>, category: string][] = [
	[new Set(["appliances_cleaning.cleaning"]), "cleaning"],
	[new Set(["appliances_cleaning.cooking"]), "kitchen-and-household"],
	[new Set(["appliances_cleaning.laundry"]), "kitchen-and-household"],
	[new Set(["blinds_curtains"]), "cover"],
	[new Set(["buttons_remotes"]), "button-switch-and-control"],
	[new Set(["climate"]), "climate-control"],
	// subsumes air purifiers and humidifiers
	[new Set(["climate.air_purifiers_humidifiers"]), "climate-control"],
	[new Set(["climate.fans_ventilation"]), "fan"],
	// subsumes heat pumps and air conditioners
	[new Set(["climate.heat_pumps_air_conditioning"]), "climate-control"],
	// subsumes thermostats, boilers and heaters
	[new Set(["climate.thermostats_heating"]), "climate-control"],
	[new Set(["climate.water_heaters"]), "water-heater"],
	// subsumes ink and 3d printers
	[new Set(["computers_network.printers"]), "printing"],
	[new Set(["computers_network.routers_network"]), "networking"],
	[new Set(["energy"]), "power-and-energy"],
	[new Set(["energy.backup_power"]), "power-and-energy"],
	[new Set(["energy.ev_charging"]), "ev-charging"],
	[new Set(["energy.meters_monitoring"]), "metering"],
	[new Set(["energy.solar_batteries"]), "power-and-energy"],
	// subsumes irrigation, lawn mowers and plant sensors
	[new Set(["garden_plants"]), "garden"],
	[new Set(["hubs_protocols.smart_home_hubs"]), "smart-home-hub"],
	[new Set(["lighting"]), "lighting"],
	[new Set(["lighting.bulbs_lamps"]), "bulb"],
	[new Set(["lighting.led_strips_controllers"]), "lighting"],
	[new Set(["lighting.lighting_systems"]), "lighting"],
	[new Set(["media_entertainment"]), "entertainment"],
	[new Set(["media_entertainment.gaming"]), "entertainment"],
	// subsumes speakers and audio receivers
	[new Set(["media_entertainment.speakers_audio"]), "speaker"],
	// subsumes televisions, projectors and streaming devices
	[new Set(["media_entertainment.tv_streaming"]), "entertainment"],
	[new Set(["pets"]), "pets"],
	[new Set(["presence_location"]), "device-tracker"],
	[new Set(["presence_location.network_presence"]), "device-tracker"],
	[new Set(["presence_location.phones_companion_apps"]), "device-tracker"],
	[new Set(["presence_location.trackers"]), "device-tracker"],
	[new Set(["security_safety"]), "security-and-access-control"],
	[new Set(["security_safety.alarm_systems"]), "alarm-and-siren"],
	[new Set(["security_safety.cameras"]), "camera"],
	[new Set(["security_safety.doorbells_intercoms"]), "doorbell"],
	// subsumes locks, keypads and access control systems
	[new Set(["security_safety.locks_access"]), "security-and-access-control"],
	[new Set(["security_safety.smoke_co_alarms"]), "alarm-and-siren"],
	[new Set(["sensors"]), "monitoring"],
	[new Set(["sensors.air_quality"]), "air-quality-sensor"],
	[new Set(["sensors.door_window"]), "contact-sensor"],
	[new Set(["sensors.motion_presence"]), "motion-and-presence-sensor"],
	[new Set(["sensors.temperature_humidity"]), "environment-sensor"],
	[new Set(["vehicles_transport"]), "vehicle-and-mobility"],
	[new Set(["vehicles_transport.bikes_scooters"]), "vehicle-and-mobility"],
	[new Set(["vehicles_transport.cars_evs"]), "car"],
	[new Set(["water"]), "water-management"],
	[new Set(["water.meters_leak_detection"]), "water-management"],
	[new Set(["water.pools_spas"]), "pool-and-spa"],
	[new Set(["water.water_treatment"]), "water-management"],
	[new Set(["weather_alerts"]), "weather"],
	[new Set(["weather_alerts.air_quality_pollen"]), "weather"],
	[new Set(["weather_alerts.forecasts"]), "weather"],
	// combinations that remain unambiguous
	[
		new Set([
			"computers_network.routers_network",
			"presence_location.network_presence",
		]),
		"networking",
	],
	[
		new Set(["energy.meters_monitoring", "water.meters_leak_detection"]),
		"metering",
	],
	[
		new Set(["energy.meters_monitoring", "energy.solar_batteries"]),
		"power-and-energy",
	],
	[new Set(["energy.ev_charging", "energy.meters_monitoring"]), "ev-charging"],
	[
		new Set(["security_safety.cameras", "security_safety.doorbells_intercoms"]),
		"security-and-access-control",
	],
	[
		new Set([
			"security_safety.doorbells_intercoms",
			"security_safety.locks_access",
		]),
		"security-and-access-control",
	],
	[
		new Set([
			"climate.heat_pumps_air_conditioning",
			"climate.thermostats_heating",
		]),
		"climate-control",
	],
	[
		new Set([
			"climate.fans_ventilation",
			"climate.heat_pumps_air_conditioning",
		]),
		"climate-control",
	],
	[
		new Set([
			"climate.heat_pumps_air_conditioning",
			"climate.thermostats_heating",
			"climate.water_heaters",
		]),
		"climate-control",
	],
	[
		new Set(["sensors.air_quality", "sensors.temperature_humidity"]),
		"environment-sensor",
	],
	[
		new Set([
			"media_entertainment.speakers_audio",
			"media_entertainment.tv_streaming",
		]),
		"entertainment",
	],
	[
		new Set(["lighting.bulbs_lamps", "lighting.led_strips_controllers"]),
		"lighting",
	],
	[
		new Set(["water.meters_leak_detection", "water.water_treatment"]),
		"water-management",
	],
	[
		new Set(["presence_location.trackers", "vehicles_transport.cars_evs"]),
		"vehicle-and-mobility",
	],
];

const formatHaCategoryPattern = (pattern: Set<string>) =>
	[...pattern].join(", ");

{
	let valid = true;
	for (const haCategory of haCategoryFilter) {
		if (!haCategoryIdentifiers.has(haCategory)) {
			console.error(
				`[!] filter references non-existent ha category <${haCategory}>`,
			);
			valid = false;
    }
	}
	for (const [pattern, category] of haCategoryMapping) {
		for (const haCategory of pattern) {
			if (!haCategoryIdentifiers.has(haCategory)) {
				console.error(
					`[!] mapping for category pattern <${formatHaCategoryPattern(pattern)}> references non-existent ha category <${haCategory}>`,
				);
				valid = false;
			}
		}

		if (!categoryIdentifiers.has(category)) {
			console.error(
				`[!] mapping for category pattern <${formatHaCategoryPattern(pattern)}> references non-existent category identifier <${category}>`,
			);
			valid = false;
		}
	}
	if (!valid) {
		process.exit(1);
	}
}

const integrationCategoryMapping: Record<string, string[]> = {
	acaia: ["scale"],
	advantage_air: ["air-conditioner"],
	airgradient: ["air-quality-sensor"],
	airos: ["networking"],
	airq: ["air-quality-sensor"],
	airthings: ["air-quality-sensor"],
	airthings_ble: ["air-quality-sensor"],
	airvisual_pro: ["air-quality-sensor"],
	airzone: ["hvac"],
	airzone_cloud: ["hvac"],
	alarmdecoder: ["alarm-and-siren"],
	altruist: ["environment-sensor"],
	ambient_station: ["weather"],
	anova: ["sous-vide"],
	aprilaire: ["thermostat"],
	aquacell: ["water-management"],
	aqualogic: ["pool-and-spa"],
	aranet: ["environment-sensor"],
	arve: ["air-quality-sensor"],
	aseko_pool_live: ["pool-and-spa"],
	asuswrt: ["router"],
	atag: ["hvac"],
	august: ["security-and-access-control"],
	awair: ["air-quality-sensor"],
	axis: ["security-and-access-control"],
	baf: ["climate-control"],
	balboa: ["pool-and-spa"],
	bang_olufsen: ["speaker"],
	bbox: ["router", "device-tracker"],
	braviatv: ["tv"],
	brother: ["ink-printer"],
	canary: ["security-and-access-control"],
	casper_glow: ["lighting"],
	daikin: ["air-conditioner"],
	deako: ["lighting"],
	decora_wifi: ["switch"],
	devolo_home_network: ["networking"],
	dlink: ["plug-and-outlet"],
	ecovacs: ["vacuum"],
	ecowitt: ["weather"],
	elkm1: ["alarm-and-siren"],
	energenie_power_sockets: ["plug-and-outlet"],
	fjaraskupan: ["kitchen-and-household"],
	fluss: ["security-and-access-control"],
	freebox: ["router", "device-tracker"],
	freshr: ["monitoring"],
	futurenow: ["lighting"],
	govee_ble: ["environment-sensor"],
	hlk_sw16: ["switch"],
	home_connect: ["kitchen-and-household"],
	homewizard: ["metering"],
	imou: ["camera"],
	inkbird: ["environment-sensor"],
	kmtronic: ["switch"],
	leaone: ["scale"],
	midea: ["air-conditioner"],
	miele: ["kitchen-and-household"],
	modern_forms: ["fan"],
	my_pv: ["water-heater"],
	novy_cooker_hood: ["kitchen-and-household"],
	orvibo: ["plug-and-outlet"],
	prusalink: ["3d-printer"],
	roborock: ["vacuum"],
	ruuvi_gateway: ["environment-sensor"],
	saunum: ["pool-and-spa"],
	sensibo: ["air-conditioner"],
	solarman: ["power-and-energy"],
	tami4: ["kitchen-and-household"],
	tesla_fleet: ["car"],
	teslemetry: ["car"],
	tessie: ["car"],
	thermopro: ["environment-sensor"],
	toon: ["thermostat"],
	tradfri: ["lighting"],
	ultraloq: ["door-lock"],
	victron_gx: ["power-and-energy"],
	vodafone_station: ["router", "device-tracker"],
	watergate: ["valve"],
	weheat: ["heat-pump"],
	wled: ["lighting"],
	xiaomi_ble: ["environment-sensor"],
	yale_smart_alarm: ["security-and-access-control"],
	zeversolar: ["power-and-energy"],
};
{
	let valid = true;
	for (const [integration, categories] of Object.entries(
		integrationCategoryMapping,
	)) {
		for (const category of categories) {
			if (!categoryIdentifiers.has(category)) {
				console.error(
					`[!] integration category mapping of <${integration}> contained non-existent category identifier <${category}>`,
				);
				valid = false;
			}
		}
	}

	if (!valid) {
		process.exit(1);
	}
}

const integrationExcluded = new Set([
	// deal with physical device, but doesn't reveal device metadata
	"bsblan",
	"voip",
	// solely device tracking
	"actiontec",
	"arris_tg2492lg",
	"aruba",
	"autoskope",
	"bt_home_hub_5",
	"cisco_ios",
	"cisco_mobility_express",
	"cppm_tracker",
	"ddwrt",
	"fortios",
	"hitron_coda",
	"icloud",
	"keenetic_ndms2",
	"linksys_smart",
	"luci",
	"meraki",
	"mikrotik",
	"opnsense",
	"quantum_gateway",
	"ruckus_unleashed",
	"sky_hub",
	"swisscom",
	"thomson",
	"tomato",
	"ubus",
	"unifi_direct",
	"upc_connect",
	"wirelesstag",
	"private_ble_device",
	"bt_smarthub",
	// protocol integrations are overly generic
	"arest",
	"bluetooth",
	"bluetooth_le_tracker",
	"bthome",
	"dlna_dmr",
	"matter",
	"mqtt",
	"pilight",
	"snmp",
	"zha",
	"zwave_js",
	"tellstick",
	"zwave_me",
	// gateway integrations that are overly generic
	"firmata",
	"gentex_homelink",
	"homekit",
	"homematic",
	"homeworks",
	"ihc",
	"inels",
	"litejet",
	"rflink",
	"smartthings",
	"tasmota",
	"vera",
	"versasense",
	"deconz",
	"devolo_home_control",
	"alexa_devices",
	// vendor integration that are overly generic
	"abode",
	"ads",
	"bosch_shc",
	"netatmo",
	"supla",
	"tuya",
	"wemo",
	"wilight",
	"broadlink",
	"comelit",
	"compit",
	"control4",
	"zimi",
	"yolink",
	// _really_ obscure
	"progettihwsw",
	"qwikswitch",
	"tank_utility",
	"thinkingcleaner",
	"upb",
	"xs1",
	"anel_pwrctrl",
	// user-configurable name
	"elv",
	"garadget",
	"greeneye_monitor",
	"heatmiser",
	"hikvisioncam",
	"horizon",
	"hp_ilo",
	"idteck_prox",
	"iglo",
	"itach",
	"kaiterra",
	"kankun",
	"kef",
	"kira",
	"kwb",
	"lacrosse",
	"lightwave",
	"limitlessled",
	"lw12wifi",
	"maxcube",
	"mediaroom",
	"mochad",
	"nad",
	"nasweb",
	"netio",
	"numato",
	"nx584",
	"oem",
	"opple",
	"pencom",
	"raspyrfm",
	"recswitch",
	"russound_rnet",
	"saj",
	"serial_pm",
	"sisyphus",
	"skybeacon",
	"sony_projector",
	"stiebel_eltron",
	"switchmate",
	"ted5000",
	"temper",
	"torque",
	"traccar",
	"traccar_server",
	"vivotek",
	"w800rf32",
	"x10",
	"xeoma",
	"xiaomi",
	"ziggo_mediabox_xl",
	"yi",
	"yeelight",
	"yamaha",
	// purely "virtual" integrations
	"ai_task",
	"apcupsd",
	"agent_dvr",
	"air_quality",
	"alarm_control_panel",
	"alert",
	"alpha_vantage",
	"amazon_polly",
	"apache_kafka",
	"apprise",
	"aprs",
	"arwn",
	"assist_satellite",
	"aws",
	"azure_service_bus",
	"baidu",
	"binary_sensor",
	"bitcoin",
	"bizkaibus",
	"blockchain",
	"browser",
	"button",
	"calendar",
	"camera",
	"channels",
	"cisco_webex_teams",
	"citybikes",
	"clickatell",
	"clicksend",
	"clicksend_tts",
	"climate",
	"cmus",
	"color_extractor",
	"comed_hourly_pricing",
	"command_line",
	"compensation",
	"conversation",
	"counter",
	"cover",
	"cpuspeed",
	"currencylayer",
	"date",
	"datetime",
	"delijn",
	"demo",
	"derivative",
	"device_sun_light_trigger",
	"device_tracker",
	"dialogflow",
	"digital_ocean",
	"discogs",
	"doods",
	"ebox",
	"electric_kiwi",
	"emby",
	"emoncms_history",
	"emulated_hue",
	"emulated_kasa",
	"emulated_roku",
	"event",
	"facebook",
	"fail2ban",
	"fan",
	"ffmpeg_motion",
	"ffmpeg_noise",
	"fido",
	"file",
	"filesize",
	"filter",
	"fixer",
	"flock",
	"flux",
	"folder",
	"folder_watcher",
	"forked_daapd",
	"foursquare",
	"free_mobile",
	"freedns",
	"generic_hygrostat",
	"generic_thermostat",
	"geo_location",
	"geo_rss_events",
	"geofency",
	"gitlab_ci",
	"gitter",
	"google_maps",
	"google_pubsub",
	"google_wifi",
	"gpsd",
	"gpslogger",
	"graphite",
	"group",
	"gtfs",
	"hassio",
	"haveibeenpwned",
	"hddtemp",
	"hdmi_cec",
	"history_stats",
	"holiday",
	"homeassistant_connect_zbt2",
	"homeassistant_green",
	"homeassistant_sky_connect",
	"homeassistant_yellow",
	"humidifier",
	"ifttt",
	"image",
	"image_processing",
	"improv_ble",
	"influxdb",
	"infrared",
	"input_boolean",
	"input_button",
	"input_datetime",
	"input_number",
	"input_select",
	"input_text",
	"integration",
	"intent_script",
	"ios",
	"iperf3",
	"irish_rail_transport",
	"itunes",
	"jewish_calendar",
	"joaoapps_join",
	"keyboard_remote",
	"kitchen_sink",
	"lawn_mower",
	"lifx_cloud",
	"light",
	"linode",
	"linux_battery",
	"llamalab_automate",
	"local_calendar",
	"local_file",
	"local_ip",
	"local_todo",
	"locative",
	"lock",
	"london_air",
	"manual",
	"manual_mqtt",
	"marytts",
	"matrix",
	"mcp",
	"media_extractor",
	"media_player",
	"message_bird",
	"meteoalarm",
	"microsoft",
	"min_max",
	"minio",
	"mjpeg",
	"modbus",
	"modem_callerid",
	"mold_indicator",
	"mpd",
	"mqtt_eventstream",
	"mqtt_json",
	"mqtt_room",
	"mqtt_statestream",
	"msteams",
	"mvglive",
	"mythicbeastsdns",
	"netdata",
	"neurio_energy",
	"nilu",
	"nmap_tracker",
	"no_ip",
	"noaa_tides",
	"norway_air",
	"notify",
	"notify_events",
	"nsw_fuel_station",
	"number",
	"oasa_telematics",
	"obihai",
	"ohmconnect",
	"ombi",
	"openalpr_cloud",
	"openerz",
	"openhardwaremonitor",
	"opensensemap",
	"otp",
	"p1_monitor",
	"plant",
	"pocketcasts",
	"profiler",
	"prometheus",
	"proximity",
	"proxy",
	"pulseaudio_loopback",
	"push",
	"pushsafer",
	"python_script",
	"qrcode",
	"radio_frequency",
	"random",
	"reddit",
	"rejseplanen",
	"remember_the_milk",
	"remote",
	"remote_rpi_gpio",
	"repetier",
	"rest_command",
	"rhasspy",
	"ripple",
	"rmvtransport",
	"rocketchat",
	"route53",
	"rpi_power",
	"rss_feed_template",
	"rtorrent",
	"scene",
	"schedule",
	"scrape",
	"select",
	"sendgrid",
	"sensor",
	"serial",
	"seven_segments",
	"shell_command",
	"shodan",
	"shopping_list",
	"sighthound",
	"signal_messenger",
	"sinch",
	"siren",
	"smart_meter_texas",
	"smtp",
	"snapcast",
	"sql",
	"starlingbank",
	"startca",
	"statistics",
	"statsd",
	"stt",
	"supervisord",
	"swiss_hydrological_data",
	"switch",
	"switch_as_x",
	"synology_chat",
	"synology_srm",
	"syslog",
	"systemmonitor",
	"tag",
	"tailscale",
	"tapsaff",
	"tautulli",
	"tcp",
	"telegram",
	"telnet",
	"template",
	"text",
	"thingspeak",
	"threshold",
	"time",
	"timer",
	"tmb",
	"tod",
	"todo",
	"transport_nsw",
	"trend",
	"tts",
	"twilio_call",
	"twilio_sms",
	"twitter",
	"uk_transport",
	"universal",
	"update",
	"utility_meter",
	"vacuum",
	"valve",
	"vasttrafik",
	"version",
	"viaggiatreno",
	"voicerss",
	"volkszaehler",
	"wake_word",
	"water_heater",
	"weather",
	"weatherflow_cloud",
	"webmin",
	"worldtidesinfo",
	"xmpp",
	"yandex_transport",
	"yandextts",
	"zabbix",
	"zodiac",
	"zoneminder",
]);

const haIntegrationTypeExcluded = new Set([
	"system",
	"service",
	// aren't real integrations 🙈
]);

const componentsDirectory = join(coreDirectory, "homeassistant", "components");

/** subset of the integration manifest that is of interest here */
type Manifest = {
	domain?: unknown;
	name?: unknown;
	documentation?: unknown;
	categories?: unknown;
	integration_type?: unknown;
	iot_class?: unknown;
	supported_by?: unknown;
	connectivity?: unknown;
	quality_scale?: unknown;
};

const result: Record<
	string,
	{
		title: string;
		url: string;
		ha_categories_filtered: string[];
		category?: { classified: string[]; inferred: boolean };
		connectivity?: "online" | "offline" | undefined;
		ha_connectivity?: string[];
		ha_quality_scale?: string;
		aliases: string[];
	}
> = {};

const stats = {
	overall: 0,
	skipped: {
		integration_type: 0,
		domain_name_mismatch: 0,
	},
	categorized: { manual: 0, inferred: 0, missing: 0, skipped: 0 },
};

const aliases: Map<string, Set<string>> = new Map();

/** how often each ha category pattern was matched, keyed by position in the mapping */
const haCategoryMappingEncountered: Map<number, number> = new Map();

const integrationEncountered: Set<string> = new Set();
for await (const path of glob(`${componentsDirectory}/*/manifest.json`)) {
	const name = basename(dirname(path));

	let parsed: Manifest;
	try {
		parsed = JSON.parse(await readFile(path, "utf-8"));
	} catch {
		console.error(`[!] failed to parse manifest <${path}>`);
		continue;
	}

	stats.overall += 1;

	integrationEncountered.add(name);

	let includeCategory = true;
	if (
		typeof parsed.integration_type === "string" &&
		haIntegrationTypeExcluded.has(parsed.integration_type)
	) {
		stats.skipped.integration_type += 1;
		includeCategory = false;
	}

	if (parsed.domain !== name) {
		stats.skipped.domain_name_mismatch += 1;
		continue;
	}

	if (integrationExcluded.has(name)) {
		stats.categorized.skipped += 1;
		includeCategory = false;
	}

	if (Object.keys(result).includes(name)) {
		console.error(`[!] integration name clash (${name}), exclude integration`);
		process.exit(1);
	}

	// virtual integrations are supported by another integration, which is the
	// one that ends up providing the device
	if (typeof parsed.supported_by === "string" && parsed.supported_by !== name) {
		const bucket = aliases.get(parsed.supported_by);
		if (typeof bucket === "undefined") {
			aliases.set(parsed.supported_by, new Set([name]));
		} else {
			bucket.add(name);
		}

		continue;
	}

	const title = parsed.name;
	if (typeof title !== "string") {
		continue;
	}

	let categories;
	{
		const found = parsed.categories;
		// not every integration is categorized
		const filtered: Set<string> = new Set(
			Array.isArray(found) ? (found as string[]) : [],
		);

		for (const excluded of haCategoryFilter) {
			filtered.delete(excluded);
		}

		categories = [...filtered];
	}

	let category;
	category: {
		if (!includeCategory) {
			break category;
		}

		if (typeof integrationCategoryMapping[name] !== "undefined") {
			category = {
				classified: integrationCategoryMapping[name],
				inferred: false,
			};
			stats.categorized.manual += 1;
		} else {
			for (const [
				index,
				[keySet, classification],
			] of haCategoryMapping.entries()) {
				if (
					keySet.size === categories.length &&
					categories.every((c) => keySet.has(c))
				) {
					category = { classified: [classification], inferred: true };
					haCategoryMappingEncountered.set(
						index,
						(haCategoryMappingEncountered.get(index) ?? 0) + 1,
					);
					stats.categorized.inferred += 1;
					break;
				}
			}
		}
		if (typeof category === "undefined") {
			stats.categorized.missing += 1;
		}
	}

	let connectivity;
	switch (parsed.iot_class) {
		case "local_push":
		case "local_polling":
			connectivity = "offline" as const;
			break;
		case "cloud_push":
		case "cloud_polling":
			connectivity = "online" as const;
			break;
		default:
			break;
	}

	const haConnectivity =
		Array.isArray(parsed.connectivity) &&
		parsed.connectivity.every((c) => typeof c === "string")
			? (parsed.connectivity as string[])
			: undefined;

	const haQualityScale =
		typeof parsed.quality_scale === "string"
			? parsed.quality_scale
			: undefined;

	result[name] = {
		title,
		url:
			typeof parsed.documentation === "string"
				? parsed.documentation
				: `https://www.home-assistant.io/integrations/${name}`,
		ha_categories_filtered: categories,
		category,
		connectivity,
		ha_connectivity: haConnectivity,
		ha_quality_scale: haQualityScale,
		aliases: [],
	};
}

for (const [parent, children] of aliases) {
	if (!Object.keys(result).includes(parent)) {
		continue;
	}

	result[parent].aliases = [...children];
}

await writeFile(out, JSON.stringify(result, null, 2));

console.log("[*] stats →", stats);
console.log(
	"[*] explicitly ignored integrations that were never encountered →",
	[...integrationExcluded.difference(integrationEncountered)],
);
console.log(
	"[*] explicitly mapped integrations that were never encountered →",
	[
		...new Set(Object.keys(integrationCategoryMapping)).difference(
			integrationEncountered,
		),
	],
);
console.log("[*] explicitly mapped integrations that were never excluded →", [
	...new Set(Object.keys(integrationCategoryMapping)).intersection(
		integrationExcluded,
	),
]);
console.log(
	"[*] ha category patterns that were matched →",
	Object.fromEntries(
		haCategoryMapping
			.map(
				([pattern], index) =>
					[
						formatHaCategoryPattern(pattern),
						haCategoryMappingEncountered.get(index) ?? 0,
					] as const,
			)
			.filter(([, encountered]) => encountered > 0)
			.sort(([, a], [, b]) => b - a),
	),
);
console.log(
	"[*] ha category patterns that were never matched →",
	haCategoryMapping.flatMap(([pattern], index) =>
		haCategoryMappingEncountered.has(index)
			? []
			: [formatHaCategoryPattern(pattern)],
	),
);
