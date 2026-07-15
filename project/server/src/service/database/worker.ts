import { DatabaseSync } from "node:sqlite";
import { type MessagePort, parentPort, workerData } from "node:worker_threads";

import type { BoundQuery, ConnectionMode, ResultMode } from "./query";

export type WorkerData = {
	uri: string;
	connectionMode: ConnectionMode;
	pragmas: Record<string, string>;
	// `symbol` isn't supported by `structuredClone` → pass peeked uri as string
	attached: Record<string, string>;
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

const { connectionMode, uri, pragmas, attached } = workerData as WorkerData;

const parsed = new URL(uri);
const db = new DatabaseSync(parsed, {
	readOnly:
		connectionMode === "r" ||
		// also respect mode encoded in uri
		parsed.searchParams.get("mode") === "ro",
	timeout: 5000,
});

for (const [key, value] of Object.entries(pragmas)) {
	db.exec(`pragma ${key} = ${value}`);
}
for (const [name, uri] of Object.entries(attached)) {
	const prepared = db.prepare(`attach ? as ${name}`);
	prepared.run(uri);
}

parentPort?.on(
	"message",
	async ([transaction, transactionPort]: [
		transaction: "immediate" | "deferred" | "none",
		transactionPort: MessagePort,
	]) => {
		switch (transaction) {
			case "immediate":
				db.exec("begin immediate transaction;");
				break;
			case "deferred":
				db.exec("begin deferred transaction;");
				break;
			case "none":
				break;
		}

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
						if (transaction !== "none") {
							db.exec(message.rollback ? "rollback;" : "commit;");
						}
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
