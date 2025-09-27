import { mock } from "node:test";

import { test } from "tap";

import { logger } from "../../logger";
import { getSnapshot, updateSnapshotVersion } from "../database/query/shapshot";
import { testDatabase } from "../database/utility";
import { Dispatch } from "../dispatch";
import { DispatchReporterConsole } from "../dispatch/reporter/console";
import { Signal } from "../signal";
import { Snapshot } from ".";

import type { Event, ISignalProvider } from "../signal/base";

class Provider implements ISignalProvider {
	async send(event: Event): Promise<void> {}
	supported(event: Event): boolean {
		return true;
	}
}

test("import", async (t) => {
	const database = await testDatabase();

	logger.level = "error";

	{
		const provider = new Provider();
		const send = mock.method(provider, "send", async (event: Event) => {
			t.match(event, {
				kind: "submission",
				context: {
					id: String,
					contact: "foo@nabucasa.com",
					version: undefined,
				},
			});
		});

		const snapshot = new Snapshot(
			database,
			new Dispatch(new DispatchReporterConsole()),
			new Signal([provider]),
		);
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

		t.equal(send.mock.callCount(), 1);
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

		const provider = new Provider();
		const send = mock.method(provider, "send", async (event: Event) => {
			t.match(event, {
				kind: "submission",
				context: {
					id: String,
					contact: "foo@nabucasa.com",
					version: 0,
				},
			});
		});

		const snapshot = new Snapshot(
			database,
			new Dispatch(new DispatchReporterConsole()),
			new Signal([provider]),
		);
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

		t.equal(send.mock.callCount(), 1);
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
					is_custom_integration: null,
				},
			},
		};

		const provider = new Provider();
		const send = mock.method(provider, "send", async (event: Event) => {
			t.match(event, {
				kind: "submission",
				context: {
					id: String,
					contact: "foo@nabucasa.com",
					version: 1,
				},
			});
		});

		const snapshot = new Snapshot(
			database,
			new Dispatch(new DispatchReporterConsole()),
			new Signal([provider]),
		);
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

		t.equal(send.mock.callCount(), 1);
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
				},
			},
		};

		const provider = new Provider();
		const send = mock.method(provider, "send", async (event: Event) => {
			t.match(event, {
				kind: "submission",
				context: {
					id: String,
					contact: "foo@nabucasa.com",
					version: 2,
				},
			});
		});

		const snapshot = new Snapshot(
			database,
			new Dispatch(new DispatchReporterConsole()),
			new Signal([provider]),
		);
		t.match(
			await snapshot.import({
				contact: "foo@nabucasa.com",
				data,
			} as const),
			{
				id: String,
				version: 2,
				data,
				contact: "foo@nabucasa.com",
				createdAt: Date,
			},
			"schema v2",
		);

		t.equal(send.mock.callCount(), 1);
	}
});

test("reexamine", async (t) => {
	const database = await testDatabase();
	const snapshot = new Snapshot(
		database,
		new Dispatch(new DispatchReporterConsole()),
		new Signal([]),
	);

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

	const imported = await snapshot.import({
		contact: "foo@nabucasa.com",
		data,
	});

	await database.run(
		updateSnapshotVersion.bind.named({ id: imported.id, version: -1 }),
	);

	await snapshot.reexamine();

	t.same(
		(await database.run(getSnapshot.bind.named({ id: imported.id })))?.version,
		0,
	);
});
