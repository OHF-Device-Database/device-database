import { createType } from "@lppedd/di-wise-neo";
import { Schema } from "effect";

import type { IDatabaseSnapshotCoordinator } from ".";

export const DatabaseSnapshotCoordinatorName = Schema.Literal("staging");
export type DatabaseSnapshotCoordinatorName =
	typeof DatabaseSnapshotCoordinatorName.Type;

export const DatabaseSnapshotCoordinators = createType<
	Partial<Record<DatabaseSnapshotCoordinatorName, IDatabaseSnapshotCoordinator>>
>("DatabaseSnapshotCoordinators");
