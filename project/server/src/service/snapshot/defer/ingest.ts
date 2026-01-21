import { createType, inject, optional } from "@lppedd/di-wise-neo";

import { logger as parentLogger } from "../../../logger";
import { isNone, isSome } from "../../../type/maybe";
import { injectOrStub } from "../../../utility/dependency-injection";
import { IIntrospection } from "../../introspect";
import { StubIntrospection } from "../../introspect/stub";
import { Voucher } from "../../voucher";
import { ISnapshot } from "..";
import { ISnapshotDeferTarget } from "./base";

type SnapshotDeferIngestIngestStep = "idle" | "acted";

export interface ISnapshotDeferIngest {
	ingest(): AsyncIterable<SnapshotDeferIngestIngestStep>;
}

export const ISnapshotDeferIngest = createType<ISnapshotDeferIngest>(
	"ISnapshotDeferIngest",
);

const logger = parentLogger.child({
	label: "snapshot-defer-ingest",
});

export class SnapshotDeferIngest implements ISnapshotDeferIngest {
	constructor(
		private snapshot = inject(ISnapshot),
		private snapshotDeferTarget = optional(ISnapshotDeferTarget),
		introspection: IIntrospection = injectOrStub(
			IIntrospection,
			() => new StubIntrospection(),
		),
	) {
		introspection.metric.gauge(
			{
				name: "snapshot_deferred_total",
				help: "amount of deferred snapshots",
				labelNames: [],
			},
			async (collector) => {
				collector.set(
					{},
					typeof this.snapshotDeferTarget !== "undefined"
						? await this.snapshotDeferTarget.pending()
						: 0,
				);
			},
		);
	}

	async *ingest(): AsyncIterable<SnapshotDeferIngestIngestStep> {
		if (typeof this.snapshotDeferTarget === "undefined") {
			return;
		}

		while (true) {
			const deferred = await this.snapshotDeferTarget?.deferred();
			if (isNone(deferred)) {
				yield "idle";
				continue;
			}

			const { id, sub } = Voucher.peek(deferred.voucher);

			const handle = await this.snapshot.create(
				deferred.voucher,
				deferred.hassVersion,
			);
			if (isNone(handle)) {
				logger.warn("handle acquisition failed for deferred ingest", {
					id,
					sub,
				});

				yield "idle";
				continue;
			}

			try {
				for await (const item of deferred.snapshot) {
					if ("device" in item) {
						await this.snapshot.attach.device(
							handle,
							item.integration,
							item.device,
							item.entities,
						);
					} else {
						await this.snapshot.attach.entity(
							handle,
							item.integration,
							item.entity,
						);
					}
				}

				await this.snapshot.finalize(handle);
				await this.snapshotDeferTarget.complete(id);

				logger.info(`ingested <${id}> by <${sub}>`, { id, sub });
			} catch (err) {
				logger.error("ingestion failure", {
					message:
						typeof err === "object" && isSome(err) && "message" in err
							? err.message
							: "unknown error",
				});

				await this.snapshot.delete(id);
			}

			yield "acted";
		}
	}
}
