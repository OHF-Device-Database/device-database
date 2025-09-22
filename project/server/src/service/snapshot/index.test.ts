import { join } from "node:path";

import { test } from "tap";

import { logger } from "../../logger";
import { unroll } from "../../utility/iterable";
import { Database } from "../database";
import { DatabaseMigrate } from "../database/migrate";
import { Snapshot } from "./index.js";

const __dirname = import.meta.dirname;

test("import", async (t) => {
	const database = new Database(":memory:", false);
	{
		const migrate = new DatabaseMigrate(database);
		const migrations = await unroll(
			DatabaseMigrate.migrations(
				join(__dirname, "..", "database", "migration"),
			),
		);

		const plan = await migrate.plan(migrations);
		if (!DatabaseMigrate.viable(plan)) {
			throw new Error("unreachable");
		}

		await migrate.act(plan);
	}

	logger.level = "error";

	{
		const snapshot = new Snapshot(database);
		t.match(
			await snapshot.import({
				contact: "foo@nabucasa.com",
				data: {},
			} as const),
			{
				id: String,
				version: -1,
				data: {},
				contact: "foo@nabucasa.com",
				createdAt: Date,
			},
			"unknown schema",
		);
	}

	{
		const data = {
			version: "home-assistant:1",
			home_assistant: "2025.9.1",
			devices: [
				{
					integration: "sun",
					manufacturer: null,
					model_id: null,
					model: null,
					sw_version: null,
					hw_version: null,
					has_configuration_url: false,
					via_device: null,
					entry_type: "service",
					is_custom_integration: false,
				},
			],
		};

		const snapshot = new Snapshot(database);
		t.match(
			await snapshot.import({
				contact: "foo@nabucasa.com",
				data,
			} as const),
			{
				id: String,
				version: 0,
				data,
				contact: "foo@nabucasa.com",
				createdAt: Date,
			},
			"schema v0",
		);
	}

	{
		const data = {
			version: "home-assistant:1",
			home_assistant: "2025.9.1",
			integrations: {
				sun: {
					devices: [
						{
							entities: [
								{
									assumed_state: false,
									capabilities: null,
									domain: "sensor",
									entity_category: "diagnostic",
									has_entity_name: true,
									original_device_class: "timestamp",
									unit_of_measurement: null,
								},
							],
							entry_type: "service",
							has_configuration_url: false,
							hw_version: null,
							manufacturer: null,
							model: null,
							model_id: null,
							sw_version: null,
							via_device: null,
						},
					],
					entities: [],
					is_custom_integration: false,
				},
			},
		};

		const snapshot = new Snapshot(database);
		t.match(
			await snapshot.import({
				contact: "foo@nabucasa.com",
				data,
			} as const),
			{
				id: String,
				version: 1,
				data,
				contact: "foo@nabucasa.com",
				createdAt: Date,
			},
			"schema v1",
		);
	}
});
