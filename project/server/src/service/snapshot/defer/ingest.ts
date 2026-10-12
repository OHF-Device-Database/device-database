import { createType, inject } from "@lppedd/di-wise-neo";

import { logger as parentLogger } from "../../../logger";
import { isNone, isSome } from "../../../type/maybe";
import { injectOrStub } from "../../../utility/dependency-injection";
import race from "../../../utility/race-as-promised";
import {
	IIntrospection,
	type IntrospectionMetricCounter,
} from "../../introspect";
import { StubIntrospection } from "../../introspect/stub";
import { type ISuspendable, Suspendable } from "../../suspendable";
import { Voucher } from "../../voucher";
import { ISnapshot, Snapshot, type SnapshotHandleAttachable } from "..";
import { ISnapshotDeferTarget } from "./base";

import type { SnapshotRequestTransformOut } from "../stream";

type SnapshotDeferIngestIngestStep = "idle" | "acted";

type ConsumeResult = {
	stalled: boolean;
};

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
	private metrics: {
		handleAcquisitionFailure: IntrospectionMetricCounter<{
			version: string;
			reason: string;
		}>;
	};

	private ingesting = false;
	private acting = false;

	constructor(
		private snapshot = inject(ISnapshot),
		// di-wise-neo's optional() only works when there is an injection context
		private snapshotDeferTarget = injectOrStub(
			ISnapshotDeferTarget,
			() => undefined,
		),
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
				registry: "global",
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
				registry: "global",
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

		this.metrics = {
			handleAcquisitionFailure: introspection.metric.counter({
				name: "snapshot_deferred_handle_acquisition_failure_total",
				help: "amount of handle acquisition failures",
				labelNames: ["version", "reason"],
				registry: "local",
			}),
		};
	}

	override drain(): Promise<void> {
		return this.park(this.acting);
	}

	async *ingest(): AsyncIterable<SnapshotDeferIngestIngestStep> {
		const target = this.snapshotDeferTarget;
		if (typeof target === "undefined") {
			return;
		}

		// only one observer is allowed at a time
		if (this.ingesting) {
			return;
		}

		try {
			this.ingesting = true;

			while (true) {
				// just awaiting suspension lift leaves a window between lift and `this.acting` being set
				// a new suspension coming in during that window would observe a stale `this.acting` value
				// spinning on synchronous resume check forces `this.acting` modification to take place in same synchronous block
				while (!this.resumed) {
					await this.suspended();
				}

				this.acting = true;
				try {
					yield await this.act(target);
				} finally {
					this.acting = false;
					this.settle();
				}
			}
		} finally {
			this.ingesting = false;
		}
	}

	private async act(
		target: ISnapshotDeferTarget,
	): Promise<SnapshotDeferIngestIngestStep> {
		const deferred = await target.deferred();
		if (isNone(deferred)) {
			return "idle";
		}

		const { id, sub, at } = Voucher.peek(deferred.voucher);

		let completed = false;
		const created = await this.snapshot.create(
			deferred.voucher,
			deferred.hash,
			deferred.createdAt,
		);
		if (created.kind !== "success") {
			logger.warn("handle acquisition failed for deferred ingest", {
				id,
				sub,
				reason: created.reason,
				hassVersion: deferred.hassVersion,
				wantedAt: at,
				persistedAt: deferred.createdAt,
				expiresAt: this.snapshot.voucher.expiresAt(deferred.voucher),
			});

			this.metrics.handleAcquisitionFailure.increment({
				version: deferred.hassVersion,
				reason: created.reason,
			});

			await target.complete(id);

			return "acted";
		}

		try {
			if (!Snapshot.isDuplicate(created.handle)) {
				// only now is it certain the body will be read in full
				await using snapshot = await deferred.open();

				const consumed = await this.consume(created.handle, snapshot);

				// production deployment uses scaleway's s3 offering
				// said offering has been (very rarely) observed to corrupt objects
				// corrupted objects can still be requested, though their purported `content-length` exceeds the amount of bytes actually served
				// this is problematic when consuming objects in a streaming-fashion, as the s3 sdk does _not like this_
				// ingestion ends up stalling out, as the advertised `content-length` is never reached
				if (consumed.stalled) {
					logger.warn(
						`gave up on stalled deferred ingest <${id}> by <${sub}>`,
						{
							id,
							sub,
							hassVersion: deferred.hassVersion,
							persistedAt: deferred.createdAt,
						},
					);

					await target.complete(id);
					await this.snapshot.delete(id);

					return "acted";
				}
			}

			await this.snapshot.finalize(created.handle, deferred.hassVersion);

			await target.complete(id);
			completed = true;

			logger.info(`ingested <${id}> by <${sub}>`, { id, sub });
		} catch (err) {
			logger.error("ingestion failure", {
				message:
					typeof err === "object" && isSome(err) && "message" in err
						? err.message
						: "unknown error",
			});

			if (!completed) {
				await target.archive(id);
			}

			await this.snapshot.delete(id);
		}

		return "acted";
	}

	private async consume(
		handle: SnapshotHandleAttachable,
		snapshot: AsyncIterable<SnapshotRequestTransformOut>,
	): Promise<ConsumeResult> {
		const iterator = snapshot[Symbol.asyncIterator]();

		const StalledSymbol = Symbol("Stalled");
		type StalledSymbol = typeof StalledSymbol;

		// a corrupted object stalls once its real length is exhausted, which can be any read, including the one that would have reported the end of the stream
		// the deadline therefore guards every read and is restarted by each delivery, so it measures idleness rather than total duration
		const read = async (): Promise<
			IteratorResult<SnapshotRequestTransformOut> | StalledSymbol
		> => {
			const { resolve, promise: stalled } =
				Promise.withResolvers<StalledSymbol>();
			const deadline = setTimeout(() => resolve(StalledSymbol), 10_000);
			// an ingest loop that is otherwise done must not be held open by the deadline
			deadline.unref();

			try {
				return await race([iterator.next(), stalled]);
			} finally {
				clearTimeout(deadline);
			}
		};

		let next = await read();
		while (next !== StalledSymbol && next.done !== true) {
			const item = next.value;
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

			next = await read();
		}

		return { stalled: next === StalledSymbol };
	}
}
