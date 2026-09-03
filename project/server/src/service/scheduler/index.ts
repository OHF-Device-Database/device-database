import { hrtime } from "node:process";

import { createType } from "@lppedd/di-wise-neo";
import { type CronExpression, CronExpressionParser } from "cron-parser";

import { logger as parentLogger } from "../../logger";
import { isSome, type Maybe } from "../../type/maybe";
import { injectOrStub } from "../../utility/dependency-injection";
import { IIntrospection } from "../introspect";
import { StubIntrospection } from "../introspect/stub";

import type { SchedulerSchedule, SchedulerScheduledInstance } from "./base";

type SchedulerActPending = { kind: "pending"; id: symbol };
type SchedulerActSuccess = { kind: "success"; id: symbol; took: bigint };
type SchedulerActError = { kind: "error"; id: symbol; error: unknown };
type SchedulerActStatus =
	| SchedulerActPending
	| SchedulerActSuccess
	| SchedulerActError;

const SchedulerEpochSymbol = Symbol("SchedulerEpochSymbol");
const SchedulerPlanSymbol = Symbol("SchedulerPlanSymbol");

export class SchedulerWaitLateError extends Error {
	constructor(
		public desired: Date,
		public now: Date,
	) {
		super(`late for slot at <${desired}>, is <${now}>`);
		Object.setPrototypeOf(this, SchedulerWaitLateError.prototype);
	}
}

type SchedulerEpochInner = {
	next: Date;
};
export type SchedulerEpoch = {
	[SchedulerEpochSymbol]: SchedulerEpochInner;
};

type SchedulerPlanUnachievableCircularPrerequisites = {
	kind: "circular-prerequisites";
};

type SchedulerPlanUnachievableMissingPrerequisite = {
	kind: "missing-prerequisite";
	id: symbol;
};

type SchedulerPlanUnachievable =
	| SchedulerPlanUnachievableCircularPrerequisites
	| SchedulerPlanUnachievableMissingPrerequisite;

type Scheduled = {
	id: symbol;
	schedule?: SchedulerSchedule | undefined;
	run: () => Promise<void>;
};

type SchedulerPlanStrategyInnerReason = "schedule" | "dependency";
type SchedulerPlanStrategyInner = {
	pending: readonly Scheduled[];
	reasons: ReadonlyMap<symbol, ReadonlySet<SchedulerPlanStrategyInnerReason>>;
};
type SchedulerPlanStrategy = {
	[SchedulerPlanSymbol]: SchedulerPlanStrategyInner;
};

type SchedulerPlan = SchedulerPlanStrategy | SchedulerPlanUnachievable;

export class SchedulerNoScheduledError extends Error {
	constructor() {
		super("no scheduled units provided");
		Object.setPrototypeOf(this, SchedulerNoScheduledError.prototype);
	}
}

export type IScheduler = {
	/** waits until earliest scheduled execution and returns said execution */
	wait(
		epoch: SchedulerEpoch,
		options?:
			| {
					signal?: AbortSignal | undefined;
					late?: "throw" | undefined;
			  }
			| undefined,
	): Promise<SchedulerEpoch>;
	/** returns earliest scheduled execution */
	next(epoch: SchedulerEpoch): SchedulerEpoch;
	plan(epoch: SchedulerEpoch): SchedulerPlan;
	plan(id: symbol): SchedulerPlan;
	act(strategy: SchedulerPlanStrategy): AsyncIterable<SchedulerActStatus>;
};

const logger = parentLogger.child({ label: "scheduler" });

export const IScheduler = createType<Scheduler>("IScheduler");

const metrics = (introspection: IIntrospection) =>
	({
		runs: introspection.metric.counter({
			name: "scheduler_runs_total",
			help: "amount of scheduled unit runs",
			labelNames: ["id", "result"],
			registry: "local",
		}),
		runDuration: introspection.metric.histogram({
			name: "scheduler_run_duration_seconds",
			help: "execution time of scheduled units",
			labelNames: ["id"],
			buckets: [1, 2.5, 5, 7.5, 10, 30, 60, 120, 240],
			registry: "local",
		}),
	}) as const;

export class Scheduler implements IScheduler {
	private identified: Map<symbol, Scheduled> = new Map();
	// child → parents
	private prerequisites: Map<symbol, symbol[]> = new Map();

	private metrics: ReturnType<typeof metrics>;

	constructor(
		scheduled: SchedulerScheduledInstance[],
		introspect = injectOrStub(IIntrospection, () => new StubIntrospection()),
	) {
		outer: for (const s of scheduled) {
			if (!("id" in s.constructor && typeof s.constructor.id === "symbol")) {
				logger.error(
					`malformed scheduled unit <${s.constructor.name}>, missing #id`,
					{
						name: s.constructor.name,
					},
				);
				continue;
			}

			if (
				"schedule" in s.constructor &&
				typeof s.constructor.schedule !== "object"
			) {
				logger.error(
					`malformed scheduled unit <${s.constructor.name}>, misshapen #schedule`,
					{
						name: s.constructor.name,
						description: s.constructor.id.description,
					},
				);
				continue;
			}

			const _prerequisites: symbol[] = [];
			if (
				!(
					"prerequisites" in s.constructor &&
					Array.isArray(s.constructor.prerequisites)
				)
			) {
				logger.error(
					`malformed scheduled unit <${s.constructor.name}>, missing #prerequisites`,
					{
						name: s.constructor.name,
						description: s.constructor.id.description,
					},
				);
				continue;
			}
			for (const prerequisite of s.constructor.prerequisites) {
				if (typeof prerequisite !== "symbol") {
					logger.error(
						`malformed scheduled unit <${s.constructor.name}>, #prerequisites should be symbols`,
						{
							name: s.constructor.name,
							description: s.constructor.id.description,
						},
					);
					continue outer;
				} else {
					_prerequisites.push(prerequisite);
				}
			}

			this.identified.set(s.constructor.id, {
				id: s.constructor.id,
				schedule:
					"schedule" in s.constructor
						? (s.constructor.schedule as SchedulerSchedule)
						: undefined,
				run: s.run.bind(s),
			});
			this.prerequisites.set(s.constructor.id, _prerequisites);
		}

		if (this.identified.size === 0) {
			throw new SchedulerNoScheduledError();
		}

		this.metrics = metrics(introspect);
	}

	public static viable(plan: SchedulerPlan): plan is SchedulerPlanStrategy {
		return SchedulerPlanSymbol in plan;
	}

	public static peek(epoch: SchedulerEpoch): SchedulerEpochInner;
	public static peek(
		strategy: SchedulerPlanStrategy,
	): SchedulerPlanStrategyInner;
	public static peek(
		arg0: SchedulerEpoch | SchedulerPlanStrategy,
	): SchedulerEpochInner | SchedulerPlanStrategyInner {
		if (SchedulerEpochSymbol in arg0) {
			return arg0[SchedulerEpochSymbol];
		}

		return arg0[SchedulerPlanSymbol];
	}

	public static epoch(now?: Date): SchedulerEpoch {
		return { [SchedulerEpochSymbol]: { next: now ?? new Date() } };
	}

	private static parseSchedule(
		schedule: SchedulerSchedule,
		now?: Date,
	): CronExpression {
		return CronExpressionParser.parse(
			`${schedule.minute ?? "*"} ${schedule.hour ?? "*"} ${schedule.day ?? "*"} ${schedule.week ?? "*"} ${schedule.month ?? "*"}`,
			typeof now !== "undefined" ? { currentDate: now } : {},
		);
	}

	private pending(schedule: SchedulerSchedule, now: Date): boolean {
		const parsed = Scheduler.parseSchedule(schedule, now);

		// obtain current slot by progressing once, and then going back
		parsed.next();
		const prev = parsed.prev().toDate();

		return prev >= now;
	}

	public async wait(
		epoch: SchedulerEpoch,
		options?:
			| {
					signal?: AbortSignal | undefined;
					late?: "throw" | undefined;
			  }
			| undefined,
	): Promise<SchedulerEpoch> {
		const next = this.next(epoch);
		const peeked = Scheduler.peek(next);

		const waited = new Promise<SchedulerEpoch>((resolve) => {
			const now = new Date();
			const delay = peeked.next.getTime() - now.getTime();
			if (delay <= 0) {
				switch (options?.late) {
					case "throw":
						throw new SchedulerWaitLateError(peeked.next, now);
					case undefined:
						logger.warn("late for slot", { desired: peeked.next, now });
						break;
				}

				resolve(next);
			} else {
				setTimeout(() => resolve(next), delay);
			}
		});
		const aborted = new Promise<SchedulerEpoch>((_, reject) =>
			options?.signal?.addEventListener("abort", () =>
				reject(options?.signal?.reason),
			),
		);

		return await Promise.race([waited, aborted]);
	}

	public next(epoch: SchedulerEpoch): SchedulerEpoch {
		const peeked = Scheduler.peek(epoch);

		let next: Date | undefined;
		for (const { schedule } of this.identified.values()) {
			// encountered scheduled unit that doesn't have a set schedule
			if (typeof schedule === "undefined") {
				continue;
			}

			const parsed = Scheduler.parseSchedule(schedule, peeked.next);

			const date = parsed.next().toDate();
			if (typeof next === "undefined" || date < next) {
				next = date;
			}
		}

		return {
			[SchedulerEpochSymbol]: {
				// biome-ignore lint/style/noNonNullAssertion: constructor enforces that `identified` has at least one element
				next: next!,
			},
		};
	}

	private ordered(candidates: Map<symbol, Scheduled>) {
		const discovered = new Set<symbol>();
		// cycle detection
		const visiting = new Set<symbol>();
		const ordered: Scheduled[] = [];

		// https://en.wikipedia.org/wiki/Depth-first_search
		const visit = (identifier: symbol): Maybe<SchedulerPlanUnachievable> => {
			const scheduled = candidates.get(identifier);
			if (typeof scheduled === "undefined") {
				return null;
			}

			if (discovered.has(identifier)) {
				return null;
			}

			if (visiting.has(identifier)) {
				return { kind: "circular-prerequisites" };
			}

			visiting.add(identifier);

			const parents = this.prerequisites.get(identifier) ?? [];
			for (const parent of parents) {
				if (!candidates.has(parent)) {
					return { kind: "missing-prerequisite", id: parent };
				}

				const result = visit(parent);
				if (isSome(result)) {
					return result;
				}
			}

			visiting.delete(identifier);
			discovered.add(identifier);
			ordered.push(scheduled);

			return null;
		};

		for (const identifier of candidates.keys()) {
			const result = visit(identifier);
			if (isSome(result)) {
				return result;
			}
		}

		return ordered;
	}

	private planByIdentifier(id: symbol): SchedulerPlan {
		const target = this.identified.get(id);
		if (typeof target === "undefined") {
			return { kind: "missing-prerequisite", id };
		}

		const candidates: Map<symbol, Scheduled> = new Map();
		const reasons: Map<
			symbol,
			Set<SchedulerPlanStrategyInnerReason>
		> = new Map();

		candidates.set(id, target);
		reasons.set(id, new Set(["schedule"]));

		const visit = (identifier: symbol): Maybe<SchedulerPlanUnachievable> => {
			const parents = this.prerequisites.get(identifier) ?? [];
			for (const parentId of parents) {
				if (candidates.has(parentId)) {
					continue;
				}

				const parent = this.identified.get(parentId);
				if (typeof parent === "undefined") {
					return { kind: "missing-prerequisite", id: parentId };
				}

				candidates.set(parentId, parent);
				reasons.set(parentId, new Set(["dependency"]));

				const result = visit(parentId);
				if (isSome(result)) {
					return result;
				}
			}

			return null;
		};

		const result = visit(id);
		if (isSome(result)) {
			return result;
		}

		const pending = this.ordered(candidates);
		if (!Array.isArray(pending)) {
			return pending;
		}

		return {
			[SchedulerPlanSymbol]: { pending, reasons },
		};
	}
	private planByEpoch(epoch: SchedulerEpoch): SchedulerPlan {
		const { next } = Scheduler.peek(epoch);

		// scheduled units that need to run due to their own schedule, or due to schedule of
		// other scheduled units that list them as prerequisites
		const candidates: Map<symbol, Scheduled> = new Map();
		const reasons: Map<
			symbol,
			Set<SchedulerPlanStrategyInnerReason>
		> = new Map();

		{
			// scheduled unit → scheduled units listing that scheduled unit as prerequisite
			const dependencies: Map<symbol, symbol[]> = new Map();
			for (const childIdentifier of this.identified.keys()) {
				const parentIdentifiers = this.prerequisites.get(childIdentifier);
				if (
					typeof parentIdentifiers === "undefined" ||
					parentIdentifiers.length === 0
				) {
					continue;
				}

				for (const parent of parentIdentifiers) {
					const bucket = dependencies.get(parent);
					if (typeof bucket === "undefined") {
						dependencies.set(parent, [childIdentifier]);
					} else {
						bucket.push(childIdentifier);
					}
				}
			}

			for (const parentIdentifier of dependencies.keys()) {
				const parent = this.identified.get(parentIdentifier);
				if (typeof parent === "undefined") {
					return { kind: "missing-prerequisite", id: parentIdentifier };
				}

				if (typeof parent.schedule === "undefined") {
					continue;
				}
				if (!this.pending(parent.schedule, next)) {
					continue;
				}

				candidates.set(parentIdentifier, parent);
				reasons.set(
					parentIdentifier,
					reasons.get(parentIdentifier)?.add("schedule") ??
						new Set(["schedule"]),
				);
			}

			for (const [parentIdentifier, childIdentifiers] of dependencies) {
				const parent = this.identified.get(parentIdentifier);
				if (typeof parent === "undefined") {
					continue;
				}

				for (const childIdentifier of childIdentifiers) {
					const child = this.identified.get(childIdentifier);
					if (typeof child === "undefined") {
						continue;
					}

					if (typeof child.schedule === "undefined") {
						continue;
					}
					if (!this.pending(child.schedule, next)) {
						continue;
					}

					// if any child of parent is pending, consider parent pending regardless of it's own schedule
					candidates.set(parentIdentifier, parent);
					reasons.set(
						parentIdentifier,
						reasons.get(parentIdentifier)?.add("dependency") ??
							new Set(["dependency"]),
					);

					candidates.set(childIdentifier, child);
					reasons.set(
						childIdentifier,
						reasons.get(childIdentifier)?.add("schedule") ??
							new Set(["schedule"]),
					);
				}
			}

			// handle scheduled units that are neither listed as prerequisites, nor have prerequisites themselves
			for (const [identifier, scheduled] of this.identified) {
				if (dependencies.has(identifier)) {
					continue;
				}

				if ((this.prerequisites.get(identifier)?.length ?? 0) !== 0) {
					continue;
				}

				if (typeof scheduled.schedule === "undefined") {
					continue;
				}
				if (!this.pending(scheduled.schedule, next)) {
					continue;
				}

				candidates.set(identifier, scheduled);
				reasons.set(identifier, new Set(["schedule"]));
			}
		}

		const pending = this.ordered(candidates);
		if (!Array.isArray(pending)) {
			return pending;
		}

		return {
			[SchedulerPlanSymbol]: { pending, reasons },
		};
	}
	public plan(epoch: SchedulerEpoch): SchedulerPlan;
	public plan(id: symbol): SchedulerPlan;
	public plan(arg: SchedulerEpoch | symbol): SchedulerPlan {
		if (typeof arg === "symbol") {
			return this.planByIdentifier(arg);
		}

		return this.planByEpoch(arg);
	}

	async *act(
		strategy: SchedulerPlanStrategy,
	): AsyncIterable<SchedulerActStatus> {
		const peeked = strategy[SchedulerPlanSymbol];
		for (const scheduled of peeked.pending) {
			yield { kind: "pending", id: scheduled.id };

			// description is used as external identifier
			const description = scheduled.id.description;
			if (typeof description === "undefined") {
				logger.warn(`undefined description for scheduled unit <${scheduled}>`, {
					scheduled,
				});
			}

			try {
				const start = hrtime.bigint();
				await scheduled.run();
				const end = hrtime.bigint();

				yield { kind: "success", id: scheduled.id, took: end - start };

				if (typeof description !== "undefined") {
					this.metrics.runs.increment({ id: description, result: "success" });
					this.metrics.runDuration.observe(
						{ id: description },
						Number((end - start) / 1_000_000n) / 1000,
					);
				}
			} catch (error) {
				yield { kind: "error", id: scheduled.id, error };

				if (typeof description !== "undefined") {
					this.metrics.runs.increment({ id: description, result: "failure" });
				}
			}
		}
	}
}
