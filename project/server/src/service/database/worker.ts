import { DatabaseSync } from "node:sqlite";
import { type MessagePort, parentPort, workerData } from "node:worker_threads";

import { attachmentPath, type DatabaseAttachmentDescriptor } from "./base";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

export type WorkerData = {
	connectionMode: ConnectionMode;
	databasePath: string;
	pragmas: Record<string, string>;
	attached: Record<string, DatabaseAttachmentDescriptor>;
};

export type TransactionPortMessageRequest =
	| {
			kind: "query";
			bound: BoundQuery<
				string | undefined,
				ResultMode,
				ConnectionMode,
				unknown
			>;
			port: MessagePort;
	  }
	| { kind: "done"; rollback: boolean };

const { connectionMode, databasePath, pragmas, attached } =
	workerData as WorkerData;

const db = new DatabaseSync(databasePath, {
	readOnly: connectionMode === "r",
	timeout: 5000,
});
for (const [key, value] of Object.entries(pragmas)) {
	db.exec(`pragma ${key} = ${value}`);
}
for (const [name, descriptor] of Object.entries(attached)) {
	db.exec(`attach '${attachmentPath(descriptor)}' as ${name}`);
}

parentPort?.on(
	"message",
	async ([connectionMode, transactionPort]: [
		connectionMode: string,
		transactionPort: MessagePort,
	]) => {
		db.exec(
			connectionMode === "w"
				? "begin immediate transaction;"
				: "begin transaction;",
		);

		transactionPort.on("message", (message: TransactionPortMessageRequest) => {
			try {
				switch (message.kind) {
					case "query": {
						const { bound, port } = message;

						// TODO: cache statements
						const statement = db.prepare(bound.query);

						if (bound.resultMode !== "none") {
							statement.setReadBigInts(bound.integerMode === "bigint");
							statement.setReturnArrays(bound.rowMode === "tuple");

							const iterator = statement.iterate(...bound.parameters);
							for (const row of iterator) {
								port.postMessage(row);
							}
						} else {
							statement.run(...bound.parameters);
						}

						port.close();

						break;
					}
					case "done": {
						db.exec(message.rollback ? "rollback;" : "commit;");
						transactionPort.close();
						break;
					}
				}
			} catch (e) {
				db.close();
				throw e;
			}
		});
	},
);
