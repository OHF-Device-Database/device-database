import { glob, readFile, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { parseArgs } from "node:util";

import { parse as parseYaml } from "yaml";

const YAML_OPTIONS = { uniqueKeys: false } as const;

const args = parseArgs({
	options: {
		"docs-directory": { type: "string", default: "home-assistant.io" },
		"categories-file": { type: "string", default: "categories.json" },
		out: { type: "string", default: "out/derived.json" },
	},
});

const {
	values: {
		"docs-directory": docsDirectory,
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

const referenceRegex = /(?<=\[[^\]]*\]\()https?:\/\/[^)\s]+/g;

/** used to canonicalize ha categories, mostly for inconsistent casing */
const haCategoryRewrite = {
	"3D printing": "3D Printing",
	"Binary sensor": "Binary Sensor",
	"Device tracker": "Device Tracker",
	"Lawn mower": "Lawn Mower",
	"Media player": "Media Player",
	"Postal service": "Postal Service",
	"To-do list": "To-do List",
	"Water heater": "Water Heater",
	"Water management": "Water Management",
	"Device automation": "Device Automation",
	"Date/Time": "Date",
	"Tag scanner": "Tag Scanner",
	light: "Light",
	"Presence detection": "Presence Detection",
	// undocumented, coerce to nearest documented category
	"Media Source": "Media Player",
	"Media source": "Media Player",
	Multimedia: "Media Player",
} as const;

/** ha categories that don't aid in classification */
const haCategoryFilter = [
	// exclusively listed by "template" integration
	"Alarm Control Panel",
	// exclusively listed by "virtual" integrations
	"AI",
	"Automation",
	"Backup",
	"Device Automation",
	"Downloading",
	"Front end",
	"Geolocation",
	"History",
	"Image processing",
	"Mailbox",
	"Organization",
	"Postal Service",
	"Social",
	"Speech-to-text",
	"Tag Scanner",
	"Text-to-speech",
	"To-do List",
	"Transport",
	"Utility",
	"Voice",
	// mostly listed by "virtual" integrations
	"Calendar",
	"Finance",
	"Helper",
	"Notifications",
	"System monitor",
	"Radio Frequency",
	// overly generic
	"Binary Sensor",
	"Button",
	"Date",
	"Hub",
	"Intent",
	"Number",
	"Other",
	"Scene",
	"Sensor",
	"Switch",
	"Text",
	"Time",
	"Update",
	"Select",
];

/** ha categories for which accurate mapping to category hierarchy can be performed */
const haCategoryMapping: [pattern: Set<string>, category: string][] = [
	[new Set(["3D Printing"]), "3d-printer"],
	[new Set(["Camera"]), "camera"],
	[new Set(["Car"]), "car"],
	[new Set(["Climate"]), "climate-control"],
	[new Set(["Cover"]), "cover"],
	[new Set(["Device Tracker"]), "device-tracker"],
	[new Set(["Presence Detection"]), "motion-and-presence-sensor"],
	[new Set(["Doorbell"]), "doorbell"],
	[new Set(["Energy"]), "power-and-energy"],
	[new Set(["Fan"]), "fan"],
	[new Set(["Humidifier"]), "humidifier"],
	[new Set(["Irrigation"]), "irrigation"],
	[new Set(["Lawn Mower"]), "lawn-mower"],
	[new Set(["Light"]), "lighting"],
	[new Set(["Media Player"]), "entertainment"],
	[new Set(["Media Player", "Remote"]), "entertainment"],
	[new Set(["Network"]), "networking"],
	[new Set(["Plug"]), "plug-and-outlet"],
	[new Set(["Siren"]), "alarm-and-siren"],
	[new Set(["Vacuum"]), "vacuum"],
	[new Set(["Water Heater"]), "water-heater"],
	[new Set(["Water Management"]), "water-management"],
	[new Set(["Weather"]), "weather"],
	[new Set(["Alarm"]), "alarm-and-siren"],
	[new Set(["Alarm", "Lock"]), "security-and-access-control"],
];

{
	let valid = true;
	for (const [pattern, category] of haCategoryMapping) {
		if (!categoryIdentifiers.has(category)) {
			console.error(
				`[!] mapping for category pattern <${[...pattern].map((item) => `"${item}"`).join(", ")}> references non-existent category identifier <${category}>`,
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
	anova: ["sous-vide"],
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
	daikin: ["air-conditioner"],
	deako: ["lighting"],
	devolo_home_network: ["networking"],
	victron_gx: ["power-and-energy"],
	vodafone_station: ["router", "device-tracker"],
	watergate: ["valve"],
	weheat: ["heat-pump"],
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
	"zooz",
	// vendor integration that are overly generic
	"abode",
	"aqara",
	"ads",
	"bosch_shc",
	"netatmo",
	"sigfox",
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
	"aten_pe",
	// user-configurable name
	"eliqonline",
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
	"scsgate",
	"serial_pm",
	"sisyphus",
	"skybeacon",
	"solaredge_local",
	"sony_projector",
	"stiebel_eltron",
	"switchmate",
	"ted5000",
	"temper",
	"tikteck",
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
	"ampio",
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
	"clementine",
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
	"dublin_bus_transport",
	"ebox",
	"electric_kiwi",
	"emby",
	"emoncms_history",
	"emulated_hue",
	"emulated_kasa",
	"emulated_roku",
	"etherscan",
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
	"logentries",
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
	"microsoft_face",
	"microsoft_face_detect",
	"microsoft_face_identify",
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
	"mycroft",
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
	"oru",
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
	"raincloud",
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
	"travisci",
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
	"vlc",
	"voicerss",
	"volkszaehler",
	"wake_word",
	"water_heater",
	"watson_tts",
	"weather",
	"weatherflow_cloud",
	"webmin",
	"worldtidesinfo",
	"xmpp",
	"yandex_transport",
	"yandextts",
	"zabbix",
	"zestimate",
	"zodiac",
	"zoneminder",
]);

const haIntegrationTypeExcluded = new Set([
	"system",
	"service",
	// aren't real integrations 🙈
]);

const integrationsDir = join(docsDirectory, "source", "_integrations");

/** extracts yaml front matter from a jekyll markdown file */
function extractFrontMatter(content: string): string | null {
	// jekyll requires the file to start with exactly '---' followed by newline
	if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
		return null;
	}

	// find the closing delimiter: [the next line that is exactly '---' with optional trailing whitespac]e
	const startIndex = content.indexOf("\n") + 1;
	const lines = content.slice(startIndex).split(/\r?\n/);

	let endOffset = startIndex;
	for (const line of lines) {
		if (line.trimEnd() === "---") {
			return content.slice(startIndex, endOffset);
		}

		// +1 for the newline character
		endOffset += line.length + 1;
	}

	return null;
}

const result: Record<
	string,
	{
		title: string;
		url: string;
		ha_categories_filtered: string[];
		category?: { classified: string[]; inferred: boolean };
		connectivity?: "online" | "offline" | undefined;
		aliases: string[];
		references: string[];
	}
> = {};

const stats = {
	overall: 0,
	skipped: {
		manual: 0,
		integration_type: 0,
		domain_name_mismatch: 0,
	},
	categorized: { manual: 0, inferred: 0, missing: 0 },
};

const aliases: Map<string, Set<string>> = new Map();

const integrationEncountered: Set<string> = new Set();
for await (const path of glob(`${integrationsDir}/*.markdown`)) {
	const name = parse(path).name;
	const content = await readFile(path, "utf-8");

	const extracted = extractFrontMatter(content);
	if (extracted === null) {
		continue;
	}

	let parsed;
	try {
		parsed = parseYaml(extracted, YAML_OPTIONS);
	} catch {
		console.error(`[!] failed to parse front matter in <${path}>`);
		continue;
	}

	stats.overall += 1;

	integrationEncountered.add(name);

	if (haIntegrationTypeExcluded.has(parsed.ha_integration_type)) {
		stats.skipped.integration_type += 1;
		continue;
	}

	if (integrationExcluded.has(name)) {
		stats.skipped.manual += 1;
		continue;
	}

	if (parsed.ha_domain !== name) {
		stats.skipped.domain_name_mismatch += 1;
		continue;
	}

	if (Object.keys(result).includes(name)) {
		console.error(`[!] integration name clash (${name}), exclude integration`);
		process.exit(1);
	}

	if (
		typeof parsed.ha_supporting_domain !== "undefined" &&
		parsed.ha_supporting_domain !== name
	) {
		const bucket = aliases.get(parsed.ha_supporting_domain);
		if (typeof bucket === "undefined") {
			aliases.set(parsed.ha_supporting_domain, new Set([name]));
		} else {
			bucket.add(name);
		}

		continue;
	}

	const title = parsed.title;
	if (typeof title !== "string") {
		continue;
	}

	const _categories = parsed.ha_category;
	if (!Array.isArray(_categories)) {
		continue;
	}

	let categories;
	{
		const found = parsed.ha_category;
		if (!Array.isArray(found)) {
			continue;
		}

		// listed categories are not guaranteed to be unique
		const filtered: Set<string> = new Set(found);
		for (const [original, replacement] of Object.entries(haCategoryRewrite)) {
			if (filtered.has(original)) {
				filtered.delete(original);
				filtered.add(replacement);
			}
		}

		for (const excluded of haCategoryFilter) {
			filtered.delete(excluded);
		}

		categories = [...filtered];
	}

	let category;
	if (typeof integrationCategoryMapping[name] !== "undefined") {
		category = {
			classified: integrationCategoryMapping[name],
			inferred: false,
		};
		stats.categorized.manual += 1;
	} else {
		for (const [keySet, classification] of haCategoryMapping) {
			if (
				keySet.size === categories.length &&
				categories.every((c) => keySet.has(c))
			) {
				category = { classified: [classification], inferred: true };
				stats.categorized.inferred += 1;
				break;
			}
		}
	}
	if (typeof category === "undefined") {
		stats.categorized.missing += 1;
	}

	let connectivity;
	switch (parsed.ha_iot_class) {
		case "Local Push":
		case "Local Polling":
			connectivity = "offline" as const;
			break;
		case "Cloud Push":
		case "Cloud Polling":
			connectivity = "online" as const;
			break;
		default:
			break;
	}

	const references = [...content.matchAll(referenceRegex)];

	result[name] = {
		title,
		url: `https://www.home-assistant.io/integrations/${name}`,
		ha_categories_filtered: categories,
		category,
		connectivity,
		aliases: [],
		references: [...new Set(references.map((item) => item[0]))],
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
