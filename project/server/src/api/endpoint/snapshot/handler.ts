import { Schema } from "effect/index";

import {
	SnapshotContact,
	type SnapshotImportSnapshot,
} from "../../../service/snapshot";
import { effectfulEndpoint, NoParameters } from "../../base";

import type { Dependency } from "../../dependency";

const RequestBody = Schema.Struct({
	contact: Schema.String,
	data: Schema.Unknown,
});

const domains = ["openhomefoundation.org", "nabucasa.com"] as const;
type Assert = `${string}${(typeof domains)[number]}` extends SnapshotContact
	? "yes"
	: "no";
const _: Assert = "yes";

export const postSnapshot = (d: Pick<Dependency, "snapshot">) =>
	effectfulEndpoint(
		"/api/v1/snapshot",
		"post",
		NoParameters,
		RequestBody,
		async (_, requestBody) => {
			let validated: SnapshotImportSnapshot;
			{
				const contact = requestBody.contact;

				const guard = Schema.is(SnapshotContact);
				if (guard(contact)) {
					validated = {
						contact,
						data: requestBody.data,
					};
				} else {
					return {
						code: 400,
						body: `sorry, right now we only accept submissions from email addresses ending with: ${domains.join(", ")}`,
					} as const;
				}
			}

			await d.snapshot.import(validated);

			return {
				code: 200,
				body: "ok",
			} as const;
		},
	);
