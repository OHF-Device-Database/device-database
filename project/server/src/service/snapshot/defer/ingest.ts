import { createType, inject, optional } from "@lppedd/di-wise-neo";

import { logger as parentLogger } from "../../../logger";
import { isNone, isSome } from "../../../type/maybe";
import { injectOrStub } from "../../../utility/dependency-injection";
import { IIntrospection } from "../../introspect";
import { StubIntrospection } from "../../introspect/stub";
import { type ISuspendable, Suspendable } from "../../suspendable";
import { Voucher } from "../../voucher";
import { ISnapshot, Snapshot } from "..";
import { ISnapshotDeferTarget } from "./base";

type SnapshotDeferIngestIngestStep = "idle" | "acted";

export interface ISnapshotDeferIngest extends ISuspendable {
	ingest(): AsyncIterable<SnapshotDeferIngestIngestStep>;
}

export const ISnapshotDeferIngest = createType<ISnapshotDeferIngest>(
	"ISnapshotDeferIngest",
);

const logger = parentLogger.child({
	label: "snapshot-defer-ingest",
});

export class SnapshotDeferIngest
	extends Suspendable
	implements ISnapshotDeferIngest
{
	private tick: (() => void) | undefined;

	private ingesting = false;

	constructor(
		private snapshot = inject(ISnapshot),
		private snapshotDeferTarget = optional(ISnapshotDeferTarget),
		introspection: IIntrospection = injectOrStub(
			IIntrospection,
			() => new StubIntrospection(),
		),
	) {
		super();

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

		introspection.metric.gauge(
			{
				name: "snapshot_archived_total",
				help: "amount of archived snapshots",
				labelNames: [],
			},
			async (collector) => {
				collector.set(
					{},
					typeof this.snapshotDeferTarget !== "undefined"
						? await this.snapshotDeferTarget.archived()
						: 0,
				);
			},
		);
	}

	override async drain(): Promise<void> {
		if (!this.ingesting) {
			return;
		}

		const { resolve, promise: done } = Promise.withResolvers<void>();
		this.tick = () => {
			resolve();
			this.tick = undefined;
		};

		await done;
	}

	async *ingest(): AsyncIterable<SnapshotDeferIngestIngestStep> {
		if (typeof this.snapshotDeferTarget === "undefined") {
			return;
		}

		// only one observer is allowed at a time
		if (this.ingesting) {
			return;
		}

		try {
			this.ingesting = true;

			while (true) {
				this.tick?.();
				await this.suspended();

				const deferred = await this.snapshotDeferTarget?.deferred();
				if (isNone(deferred)) {
					yield "idle";

					continue;
				}

				const { id, sub } = Voucher.peek(deferred.voucher);

				let completed = false;
				const handle = await this.snapshot.create(
					deferred.voucher,
					deferred.hash,
					deferred.createdAt,
				);
				if (isNone(handle)) {
					logger.warn("handle acquisition failed for deferred ingest", {
						id,
						sub,
					});

					// TODO: figure out alternative to fully consuming that doesn't slowly leak handles
					for await (const _ of deferred.snapshot) {
					}

					await this.snapshotDeferTarget.archive(id);

					yield "acted";
					continue;
				}

				try {
					if (!Snapshot.isDuplicate(handle)) {
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
					} else {
						// TODO: figure out alternative to fully consuming that doesn't slowly leak handles
						for await (const _ of deferred.snapshot) {
						}
					}

					await this.snapshot.finalize(handle, deferred.hassVersion);

					await this.snapshotDeferTarget.complete(id);
					completed = true;

					logger.info(`ingested <${id}> by <${sub}>`, { id, sub });
				} catch (err) {
					logger.error("ingestion failure", {
						message:
							typeof err === "object" && isSome(err) && "message" in err
								? err.message
								: "unknown error",
					});
					console.error(err);

					if (!completed) {
						await this.snapshotDeferTarget.archive(id);
					}

					await this.snapshot.delete(id);
				}

				yield "acted";
			}
		} finally {
			this.ingesting = false;
		}
	}
}
