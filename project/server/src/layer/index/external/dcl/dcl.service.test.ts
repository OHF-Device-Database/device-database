import { type TestContext, test } from "node:test";

import { logger } from "../../../../logger";
import { testDatabase } from "../../../../service/database/utility";
import { unroll } from "../../../../utility/iterable";
import { IndexExternalDcl } from "./dcl.client";
import { ServiceIndexExternalDcl } from "./dcl.service";

import type { IDatabase } from "../../../../service/database";
import type { IndexFetch } from "../../paced";

logger.silent = true;

type Entry = Record<string, unknown>;
type Tx = { height: number; code: number; messages: Entry[] };

const PREFIX = "/zigbeealliance.distributedcomplianceledger";

/** in-memory ledger node serving the subset of the rest interface the client relies on */
class FakeLedger {
	height = 1;
	readonly vendors = new Map<string, Entry>();
	readonly models = new Map<string, Entry>();
	readonly versions = new Map<string, Entry>();
	readonly compliance = new Map<string, Entry>();
	readonly txs: Tx[] = [];
	readonly requests: string[] = [];

	/** appends a block holding a transaction of `messages` */
	commit(messages: Entry[], code = 0) {
		this.height += 1;
		this.txs.push({ height: this.height, code, messages });
	}

	fetch: IndexFetch = async (input) => {
		const url = new URL(input);
		this.requests.push(url.pathname);

		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), { status });
		const missing = json({ code: 5, message: "not found", details: [] }, 404);
		const single = (map: Map<string, Entry>, key: string, field: string) => {
			const entry = map.get(key);
			return typeof entry === "undefined" ? missing : json({ [field]: entry });
		};
		const listed = (map: Map<string, Entry>, field: string) => {
			const limit = Number(url.searchParams.get("pagination.limit") ?? 100);
			const key = url.searchParams.get("pagination.key");
			const offset = key === null ? 0 : Number(atob(key));
			const items = [...map.values()];
			return json({
				[field]: items.slice(offset, offset + limit),
				pagination: {
					next_key:
						offset + limit < items.length ? btoa(String(offset + limit)) : null,
					total: String(items.length),
				},
			});
		};

		const [, ...segments] = url.pathname.split("/");
		const path = segments.join("/");
		const rest = segments.slice(3).join("/");

		if (path === "cosmos/base/tendermint/v1beta1/blocks/latest") {
			return json({ block: { header: { height: String(this.height) } } });
		}
		if (path === "cosmos/tx/v1beta1/txs") {
			const page = Number(url.searchParams.get("page"));
			const limit = Number(url.searchParams.get("limit"));
			const ordered = this.txs.toSorted((a, b) => b.height - a.height);
			return json({
				tx_responses: ordered
					.slice((page - 1) * limit, page * limit)
					.map((tx) => ({
						height: String(tx.height),
						code: tx.code,
						tx: { body: { messages: tx.messages } },
					})),
				pagination: null,
				total: String(ordered.length),
			});
		}
		if (path === "dcl/vendorinfo/vendors") {
			return listed(this.vendors, "vendorInfo");
		}
		if (path === "dcl/model/models") {
			return listed(this.models, "model");
		}
		if (path === "dcl/compliance/compliance-info") {
			return listed(this.compliance, "complianceInfo");
		}
		if (path.startsWith("dcl/vendorinfo/vendors/")) {
			return single(this.vendors, rest, "vendorInfo");
		}
		if (path.startsWith("dcl/model/models/")) {
			return single(this.models, rest, "model");
		}
		if (path.startsWith("dcl/compliance/compliance-info/")) {
			return single(this.compliance, rest, "complianceInfo");
		}
		if (path.startsWith("dcl/model/versions/")) {
			if (segments.length === 6) {
				return single(this.versions, rest, "modelVersion");
			}

			const softwareVersions = [...this.versions.values()]
				.filter((v) => `${v.vid}/${v.pid}` === rest)
				.map((v) => v.softwareVersion);
			return softwareVersions.length === 0
				? missing
				: json({ modelVersions: { softwareVersions } });
		}

		return missing;
	};
}

const vendor = (vendorID: number, vendorName: string): Entry => ({
	vendorID,
	vendorName,
	companyLegalName: vendorName,
	companyPreferredName: "",
	vendorLandingPageURL: "",
	creator: "cosmos1",
	schemaVersion: 0,
});

const model = (vid: number, pid: number, productName: string): Entry => ({
	vid,
	pid,
	deviceTypeId: 256,
	productName,
	productLabel: "",
	partNumber: "",
	commissioningCustomFlow: 0,
	userManualUrl: "",
});

const version = (vid: number, pid: number, softwareVersion: number): Entry => ({
	vid,
	pid,
	softwareVersion,
	softwareVersionString: `${softwareVersion}.0`,
	softwareVersionValid: true,
	otaUrl: "",
	otaFileSize: "42",
});

const compliance = (
	vid: number,
	pid: number,
	softwareVersion: number,
	certificationType: string,
): Entry => ({
	vid,
	pid,
	softwareVersion,
	certificationType,
	softwareVersionCertificationStatus: 2,
	date: "2026-11-23T00:00:00.000Z",
	reason: "",
	history: [],
	cDCertificateId: "CSA1",
	transport: "wi-fi,bluetooth",
});

const message = (type: string, entry: Entry): Entry => ({
	"@type": `${PREFIX}.${type}`,
	creator: "cosmos1",
	...entry,
});

const rows = (db: IDatabase<"index">, sql: string) =>
	[...db.raw.query(sql, { returnArray: false }, {})].map((row) => ({
		...row,
	}));

/** ledger holding a vendor, a model with two versions, and a certification */
const populated = () => {
	const ledger = new FakeLedger();
	ledger.vendors.set("4447", vendor(4447, "Aqara"));
	ledger.models.set("4447/1", model(4447, 1, "Door Lock"));
	ledger.versions.set("4447/1/1", version(4447, 1, 1));
	ledger.versions.set("4447/1/2", version(4447, 1, 2));
	ledger.compliance.set("4447/1/1/matter", compliance(4447, 1, 1, "matter"));
	ledger.height = 10;
	return ledger;
};

test("index external dcl client", async (t: TestContext) => {
	await t.test("follows pagination", async (t: TestContext) => {
		const ledger = new FakeLedger();
		for (let id = 1; id <= 150; id++) {
			ledger.vendors.set(String(id), vendor(id, `vendor ${id}`));
		}

		const vendors = await unroll(
			new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch).vendors(),
		);
		t.assert.strictEqual(vendors.length, 150);
		t.assert.strictEqual(ledger.requests.length, 2);
	});

	await t.test(
		"collects keys touched past a height",
		async (t: TestContext) => {
			const ledger = new FakeLedger();
			ledger.commit([
				message("vendorinfo.MsgCreateVendorInfo", { vendorID: 1 }),
			]);
			ledger.commit([message("model.MsgCreateModel", { vid: 1, pid: 2 })]);
			// failed
			ledger.commit([message("model.MsgCreateModel", { vid: 9, pid: 9 })], 5);
			// out of scope
			ledger.commit([
				message("dclauth.MsgProposeAddAccount", { address: "a" }),
			]);
			ledger.commit([
				message("model.MsgCreateModelVersion", {
					vid: 1,
					pid: 2,
					softwareVersion: 3,
				}),
				message("compliance.MsgCertifyModel", {
					vid: 1,
					pid: 2,
					softwareVersion: 3,
					certificationType: "matter",
				}),
			]);

			const touched = await unroll(
				new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch).touched(2),
			);
			t.assert.deepStrictEqual(touched, [
				{ kind: "model-version", vid: 1, pid: 2, softwareVersion: 3 },
				{
					kind: "compliance",
					vid: 1,
					pid: 2,
					softwareVersion: 3,
					certificationType: "matter",
				},
				{ kind: "model", vid: 1, pid: 2 },
			]);
		},
	);

	await t.test("stops paging once past the height", async (t: TestContext) => {
		const ledger = new FakeLedger();
		for (let vendorID = 1; vendorID <= 150; vendorID++) {
			ledger.commit([message("vendorinfo.MsgUpdateVendorInfo", { vendorID })]);
		}

		const touched = await unroll(
			new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch).touched(140),
		);
		t.assert.strictEqual(touched.length, 11);
		t.assert.strictEqual(ledger.requests.length, 1);
	});

	await t.test("treats missing entries as absent", async (t: TestContext) => {
		const dcl = new IndexExternalDcl(
			{ url: "http://dcl" },
			new FakeLedger().fetch,
		);
		t.assert.strictEqual(await dcl.get({ kind: "vendor", vendorID: 1 }), null);
		t.assert.deepStrictEqual(await dcl.versions(1, 2), []);
	});
});

test("index external dcl", async (t: TestContext) => {
	await t.test("walks the ledger when not seeded", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const ledger = populated();
		const service = new ServiceIndexExternalDcl(
			db,
			new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch),
		);

		t.assert.strictEqual(await service.available(), false);
		await service.sync();
		t.assert.strictEqual(await service.available(), true);

		t.assert.deepStrictEqual(rows(db, "select * from external_dcl_vendor"), [
			{
				vendor_id: 4447,
				name: "Aqara",
				company_legal_name: "Aqara",
				company_preferred_name: null,
				landing_page_url: null,
			},
		]);
		t.assert.deepStrictEqual(
			rows(
				db,
				"select vid, pid, device_type_id, product_name, product_label, commissioning_custom_flow, user_manual_url, lsf_url from external_dcl_model",
			),
			[
				{
					vid: 4447,
					pid: 1,
					device_type_id: 256,
					product_name: "Door Lock",
					product_label: null,
					commissioning_custom_flow: 0,
					user_manual_url: null,
					lsf_url: null,
				},
			],
		);
		t.assert.deepStrictEqual(
			rows(
				db,
				"select software_version, software_version_string, software_version_valid, ota_url, ota_file_size from external_dcl_model_version order by software_version",
			),
			[
				{
					software_version: 1,
					software_version_string: "1.0",
					software_version_valid: 1,
					ota_url: null,
					ota_file_size: 42,
				},
				{
					software_version: 2,
					software_version_string: "2.0",
					software_version_valid: 1,
					ota_url: null,
					ota_file_size: 42,
				},
			],
		);
		t.assert.deepStrictEqual(
			rows(
				db,
				"select certification_type, certification_status, reason, history, cd_certificate_id, transport from external_dcl_compliance",
			),
			[
				{
					certification_type: "matter",
					certification_status: 2,
					reason: null,
					history: "[]",
					cd_certificate_id: "CSA1",
					transport: "wi-fi,bluetooth",
				},
			],
		);
		t.assert.deepStrictEqual(rows(db, "select height from external_dcl_sync"), [
			{ height: 10 },
		]);
	});

	await t.test(
		"refetches entries touched past its height",
		async (t: TestContext) => {
			await using db = await testDatabase("index", {
				derived: true,
				index: true,
			});
			const ledger = populated();
			const service = new ServiceIndexExternalDcl(
				db,
				new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch),
			);
			await service.sync();

			ledger.vendors.set("4447", vendor(4447, "Lumi"));
			ledger.commit([
				message("vendorinfo.MsgUpdateVendorInfo", vendor(4447, "Lumi")),
			]);
			// deleting a model takes its versions along
			ledger.models.delete("4447/1");
			ledger.versions.clear();
			ledger.commit([message("model.MsgDeleteModel", { vid: 4447, pid: 1 })]);
			ledger.compliance.delete("4447/1/1/matter");
			ledger.compliance.set(
				"4447/1/2/zigbee",
				compliance(4447, 1, 2, "zigbee"),
			);
			ledger.commit([
				message("compliance.MsgDeleteComplianceInfo", {
					vid: 4447,
					pid: 1,
					softwareVersion: 1,
					certificationType: "matter",
				}),
				message("compliance.MsgCertifyModel", {
					vid: 4447,
					pid: 1,
					softwareVersion: 2,
					certificationType: "zigbee",
				}),
			]);

			ledger.requests.length = 0;
			await service.sync();

			// no listing
			t.assert.deepStrictEqual(ledger.requests.toSorted(), [
				"/cosmos/base/tendermint/v1beta1/blocks/latest",
				"/cosmos/tx/v1beta1/txs",
				"/dcl/compliance/compliance-info/4447/1/1/matter",
				"/dcl/compliance/compliance-info/4447/1/2/zigbee",
				"/dcl/model/models/4447/1",
				"/dcl/vendorinfo/vendors/4447",
			]);

			t.assert.deepStrictEqual(
				rows(db, "select vendor_id, name from external_dcl_vendor"),
				[{ vendor_id: 4447, name: "Lumi" }],
			);
			t.assert.deepStrictEqual(
				rows(db, "select count(*) count from external_dcl_model"),
				[{ count: 0 }],
			);
			t.assert.deepStrictEqual(
				rows(db, "select count(*) count from external_dcl_model_version"),
				[{ count: 0 }],
			);
			t.assert.deepStrictEqual(
				rows(
					db,
					"select software_version, certification_type from external_dcl_compliance",
				),
				[{ software_version: 2, certification_type: "zigbee" }],
			);
			t.assert.deepStrictEqual(
				rows(db, "select height from external_dcl_sync"),
				[{ height: 13 }],
			);
		},
	);

	await t.test(
		"skips when the ledger didn't advance",
		async (t: TestContext) => {
			await using db = await testDatabase("index", {
				derived: true,
				index: true,
			});
			const ledger = populated();
			const service = new ServiceIndexExternalDcl(
				db,
				new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch),
			);
			await service.sync();

			ledger.requests.length = 0;
			t.assert.strictEqual(await service.pull(await service.latest()), null);
			t.assert.deepStrictEqual(ledger.requests, [
				"/cosmos/base/tendermint/v1beta1/blocks/latest",
			]);
		},
	);

	await t.test("skips stale pulls", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const ledger = populated();
		const service = new ServiceIndexExternalDcl(
			db,
			new IndexExternalDcl({ url: "http://dcl" }, ledger.fetch),
		);

		const pulled = await service.pull(await service.latest());
		t.assert.ok(pulled !== null);
		await service.sync();

		t.assert.strictEqual(await service.apply(pulled), false);
	});

	await t.test("skips without ledger", async (t: TestContext) => {
		await using db = await testDatabase("index", {
			derived: true,
			index: true,
		});
		const service = new ServiceIndexExternalDcl(db, null);

		t.assert.strictEqual(service.configured, false);
		t.assert.strictEqual(await service.pull(await service.latest()), null);
		await service.sync();
		t.assert.strictEqual(await service.available(), false);
	});
});
