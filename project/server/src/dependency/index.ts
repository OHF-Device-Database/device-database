import { createContainer, Scope } from "@lppedd/di-wise-neo";

import { config } from "../config";
import { Database, IDatabase } from "../service/database";
import { ISnapshot, Snapshot } from "../service/snapshot";

export const container = createContainer({ defaultScope: Scope.Container });

container.register(IDatabase, {
	useFactory: () => new Database(config.database.path, false),
});

container.register(ISnapshot, { useClass: Snapshot });
