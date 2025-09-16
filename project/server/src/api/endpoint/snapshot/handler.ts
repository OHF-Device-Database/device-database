import { SnapshotImportSnapshot } from "../../../service/snapshot";
import { effectfulEndpoint, NoParameters } from "../../base";

import type { Dependency } from "../../dependency";

export const postSnapshot = (d: Pick<Dependency, "snapshot">) =>
	effectfulEndpoint(
		"/api/v1/snapshot",
		"post",
		NoParameters,
		SnapshotImportSnapshot,
		async (_, requestBody) => {
			await d.snapshot.import(requestBody);

			return {
				code: 200,
				body: "ok",
			} as const;
		},
	);
