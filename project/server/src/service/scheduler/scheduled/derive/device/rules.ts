export const literal = {
	// case-sensitive
	integration: [
		"apple_tv", // bridges devices, often with the wrong manufacturer
		"braviatv", // model is user-editable
		"epson", // only provides single, otherwise blank, device
		"fully_kiosk", // data quality
		"homekit_controller", // user-editable, roundtrips devices that have been exposed through "homekit"
		"hue_ble", // provides significantly less data than "hue"
		"husqvarna_automower_ble", // model part of model_id (as opposed to "husqvarna_automower" where model / model_id are set correctly)
		"insteon", // always unfriendly model postfixed with two hex codes
		"iotawatt", // only provides single, otherwise blank, device
		"isy994", // just _really_ poor data quality
		"lg_thinq", // model data quality
		"litterrobot", // leaks pet breeds
		"matter", // data quality
		"neato", // mode data quality; cloud service discontinued
		"onvif", // data quality
		"roborock", // model data quality
		"roon", // bridges devices without setting manufacturer correctly, user-editable
		"samsungtv", // user-editable
		"squeezebox", // user-editable
		"system_bridge", // exclusively reports virtual devices
		"tellduslive", // data quality
		"tplink_omada", // software version in model
		"tuya", // data quality
		"upnp", // mix of virtual and real devices
		"webmin", // exclusively reports virtual devices
		"xiaomi_miio", // model data quality
	],
	// case-insensitive
	manufacturer: [
		"(unknown)",
		"--",
		"1",
		"?",
		"Home Assistant",
		"HomeAssistant",
		"Smartthi",
		"TEST_VENDOR",
		"august_manuf_name_here",
		"boring test company",
		"dummy manufacturer",
		"ffff",
		"generic",
		"local",
		"manufacturer",
		"matter",
		"unbranded",
		"undefined",
		"unk_manufacturer",
		"unknown manufacturer",
		"unknown",
		"unspecified",
		"Test",
	],
	// case-insensitive
	model: ["august_model_number_here", "dummy"],
};

export const pattern = {
	// case-insensitive
	manufacturer: [
		"%ONVIF%", // a standard for ip video cameras, not an actual manufacturer
		"0x%", // some protocol integrations (mostly fritzbox, but sometimes also matter) provide internal manufacturer code instead of name
		"TUYA%", // tuya whitelabel devices (insufficient data quality)
		"\\_T%", // tuya whitelabel devices (insufficient data quality)
		"%???%", // tuya whitelabel devices (insufficient data quality)
	],
	model: [
		"%no model%",
		"% Tracked device", // device tracking
	],
};

export const alias = {
	// case-insensitive
	// generic suffixes ("Technologies", "Manufacturing", ...) are excluded, unless they are generally present in marketing material
	// corporate designators are excluded ("GmbH", "A/S", "KG", ...)
	manufacturer: [
		["ASSA ABLOY Americas Residential", "ASSA ABLOY"],
		["ASSA Abloy", "ASSA ABLOY"],
		["ASSAABLOY", "ASSA ABLOY"],
		["AVM Berlin", "FRITZ!"], // renamed itself (https://de.wikipedia.org/wiki/Fritz_(Elektronikhersteller))
		["AVM", "FRITZ!"], // renamed itself (https://de.wikipedia.org/wiki/Fritz_(Elektronikhersteller))
		["AdTrustMedia LLC dba: eZLO", "AdTrustMedia"],
		["Amazon Technologies", "Amazon"],
		["Amazon.com", "Amazon"],
		["Anker Innovations Technology", "Anker"],
		["Anker Technology", "Anker"],
		["Anker", "Anker"],
		["August Home", "August"],
		["BMW Group", "BMW"],
		["BMW_offline", "BMW"],
		["Bang &amp; Olufsen A/S", "Bang & Olufsen"],
		["Bang And Olufsen", "Bang & Olufsen"],
		["BangOlufsen", "Bang & Olufsen"],
		["Brilliant Home Technology", "Brilliant"],
		["CentraLite", "Centralite Systems"],
		["ELKO", "ELKO EP"],
		["First Alert (BRK Brands Inc)", "First Alert"],
		["GE_Appliances", "GE"],
		["Google Nest", "Google"],
		["Govee_vid", "Govee"],
		["HARMAN International Industries, Incorporated", "HARMAN International"],
		["HORNBACH Baumarkt", "HORNBACH"],
		["Hewlett-Packard", "HP"],
		["Hyundai_offline", "Hyundai"],
		["Jasco Products Company", "Jasco"],
		["Jasco Products", "Jasco"],
		["Kia_offline", "Kia"],
		["Kingston", "Kingston Technology"],
		["LG Electronics", "LG"],
		["Leviton", "Leviton Manufacturing"],
		["LightSolutions Aps", "Light Solutions"],
		["Linkplay Technology", "Linkplay"],
		["Lutron Electronics", "Lutron"],
		["MIUC Technology", "MIUC"],
		["Mill International", "Mill"],
		["Motionblinds, Coulisse", "Motionblinds"],
		["NewOne", "New One"],
		["Nuki Home Solutions", "Nuki"],
		["Paulmann lamp", "Paulmann Licht"],
		["Razer.Inc", "Razer"],
		["SEI", "SEI Robotics"],
		["SILICON_LABORATORIES", "Silicon Labs"],
		["Samsung", "Samsung Electronics"],
		["Sennheiser electronic GmbH &amp;", "Sennheiser"],
		["Sennheiser electronic", "Sennheiser"],
		["Shelly Europe", "Shelly"],
		["Signify Netherlands", "Signify"],
		["TCL Entertainment Solutions", "TCL"],
		["Telldus Technologies", "Telldus"],
		["Tesla_offline", "Tesla"],
		["TexasInstruments", "Texas Instruments"],
		["ThirdReality", "Third Reality"],
		["U-Tec", "U-tec"],
		["U-tec Group", "U-tec"],
		["Ubiquiti Networks", "Ubiquiti"],
		["Vestel", "Vestel Electronics"],
		["Volkswagen_offline", "Volkswagen"],
		["WD", "Western Digital"],
		["Western Digital Technologies", "Western Digital"],
		["YAMAHA AV AVS COMMON ACCOUNT", "Yamaha"],
		["Yale Home", "Yale"],
		["Zebra", "Zebra Technologies"],
		["eWeLink Support Device", "eWeLink"],
	],
};
