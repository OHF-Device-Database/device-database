import { hrtime } from "node:process";

import { createType } from "@lppedd/di-wise-neo";
import { type CronExpression, CronExpressionParser } from "cron-parser";

import { logger as parentLogger } from "../../logger";
import { isSome, type Maybe } from "../../type/maybe";
import { injectOrStub } from "../../utility/dependency-injection";
import { IIntrospection } from "../introspect";
import { StubIntrospection } from "../introspect/stub";

import type { DatabaseTransaction, IDatabase } from "../database";
import type { DatabaseName } from "../database/base";
import type { DeriveDerivableInstance, DeriveSchedule } from "./base";

type DeriveDeriveActPending = { kind: "pending"; id: symbol };
type DeriveDeriveActSuccess = { kind: "success"; id: symbol; took: bigint };
type DeriveDeriveActError = { kind: "error"; id: symbol; error: unknown };
type DeriveDeriveActStatus =
	| DeriveDeriveActPending
	| DeriveDeriveActSuccess
	| DeriveDeriveActError;

const DeriveEpochSymbol = Symbol("DeriveEpochSymbol");
const DerivePlanSymbol = Symbol("DerivePlanSymbol");

export class DeriveWaitLateError extends Error {
	constructor(
		public desired: Date,
		public now: Date,
	) {
		super(`late for slot at <${desired}>, is <${now}>`);
		Object.setPrototypeOf(this, DeriveWaitLateError.prototype);
	}
}

type DeriveEpochInner = {
	next: Date;
};
export type DeriveEpoch = {
	[DeriveEpochSymbol]: DeriveEpochInner;
};

type DerivePlanUnachievableCircularyPrerequisites = {
	kind: "circulary-prerequisites";
};

type DerivePlanUnachievableMissingPrerequisite = {
	kind: "missing-prerequisite";
	id: symbol;
};

type DerivePlanUnachievable =
	| DerivePlanUnachievableCircularyPrerequisites
	| DerivePlanUnachievableMissingPrerequisite;

type Derivable<DB extends DatabaseName | undefined> = {
	id: symbol;
	schedule: DeriveSchedule;
	derive: (t: DatabaseTransaction<DB, "w">) => Promise<void>;
};

type DerivePlanStrategyInnerReason = "schedule" | "dependency";
type DerivePlanStrategyInner<DB extends DatabaseName | undefined> = {
	pending: readonly Derivable<DB>[];
	reasons: ReadonlyMap<symbol, ReadonlySet<DerivePlanStrategyInnerReason>>;
};
type DerivePlanStrategy<DB extends DatabaseName | undefined> = {
	[DerivePlanSymbol]: DerivePlanStrategyInner<DB>;
};

type DerivePlan<DB extends DatabaseName | undefined> =
	| DerivePlanStrategy<DB>
	| DerivePlanUnachievable;

export class DeriveNoDerivablesError extends Error {
	constructor() {
		super("no derivables provided");
		Object.setPrototypeOf(this, DeriveNoDerivablesError.prototype);
	}
}

export type IDerive<DB extends DatabaseName | undefined> = {
	/** waits until earliest scheduled execution and returns said execution */
	wait(
		epoch: DeriveEpoch,
		options?:
			| {
					signal?: AbortSignal | undefined;
					late?: "throw" | undefined;
			  }
			| undefined,
	): Promise<DeriveEpoch>;
	/** returns earliest scheduled execution */
	next(epoch: DeriveEpoch): DeriveEpoch;
	plan(epoch: DeriveEpoch): DerivePlan<DB>;
	act(strategy: DerivePlanStrategy<DB>): AsyncIterable<DeriveDeriveActStatus>;
};

const logger = parentLogger.child({ label: "derive" });

export const IDeriveDerived = createType<Derive<"derived">>("IDeriveDerived");

const metrics = (introspection: IIntrospection) =>
	({
		runs: introspection.metric.counter({
			name: "derivable_runs_total",
			help: "amount of derivable runs",
			labelNames: ["id", "result"],
		}),
		runDuration: introspection.metric.histogram({
			name: "derivable_run_duration_seconds",
			help: "execution time of derivable",
			labelNames: ["id"],
			buckets: [1, 2.5, 5, 7.5, 10, 30, 60, 120, 240],
		}),
	}) as const;

export class Derive<DB extends DatabaseName | undefined>
	implements IDerive<DB>
{
	private identified: Map<symbol, Derivable<DB>> = new Map();
	// child → parents
	private prerequisites: Map<symbol, symbol[]> = new Map();

	private metrics: ReturnType<typeof metrics>;

	constructor(
		private database: IDatabase<DB>,
		derivables: DeriveDerivableInstance<DB>[],
		introspect = injectOrStub(IIntrospection, () => new StubIntrospection()),
	) {
		outer: for (const derivable of derivables) {
			if (
				!(
					"id" in derivable.constructor &&
					typeof derivable.constructor.id === "symbol"
				)
			) {
				logger.error(
					`malformed derivable <${derivable.constructor.name}>, missing #id`,
					{
						name: derivable.constructor.name,
					},
				);
				continue;
			}

			if (
				!(
					"schedule" in derivable.constructor &&
					typeof derivable.constructor.schedule === "object"
				)
			) {
				logger.error(
					`malformed derivable <${derivable.constructor.name}>, missing #schedule`,
					{
						name: derivable.constructor.name,
						description: derivable.constructor.id.description,
					},
				);
				continue;
			}

			const _prerequisites: symbol[] = [];
			if (
				!(
					"prerequisites" in derivable.constructor &&
					Array.isArray(derivable.constructor.prerequisites)
				)
			) {
				logger.error(
					`malformed derivable <${derivable.constructor.name}>, missing #prerequisites`,
					{
						name: derivable.constructor.name,
						description: derivable.constructor.id.description,
					},
				);
				continue;
			}
			for (const prerequisite of derivable.constructor.prerequisites) {
				if (typeof prerequisite !== "symbol") {
					logger.error(
						`malformed derivable <${derivable.constructor.name}>, #prerequisites should be symbols`,
						{
							name: derivable.constructor.name,
							description: derivable.constructor.id.description,
						},
					);
					continue outer;
				} else {
					_prerequisites.push(prerequisite);
				}
			}

			this.identified.set(derivable.constructor.id, {
				id: derivable.constructor.id,
				schedule: derivable.constructor.schedule as DeriveSchedule,
				derive: derivable.derive.bind(derivable),
			});
			this.prerequisites.set(derivable.constructor.id, _prerequisites);
		}

		if (this.identified.size === 0) {
			throw new DeriveNoDerivablesError();
		}

		this.metrics = metrics(introspect);
	}

	public static viable(
		plan: DerivePlan<DatabaseName | undefined>,
	): plan is DerivePlanStrategy<DatabaseName | undefined> {
		return DerivePlanSymbol in plan;
	}

	public static peek(epoch: DeriveEpoch): DeriveEpochInner;
	public static peek(
		strategy: DerivePlanStrategy<DatabaseName | undefined>,
	): DerivePlanStrategyInner<DatabaseName | undefined>;
	public static peek(
		arg0: DeriveEpoch | DerivePlanStrategy<DatabaseName | undefined>,
	): DeriveEpochInner | DerivePlanStrategyInner<DatabaseName | undefined> {
		if (DeriveEpochSymbol in arg0) {
			return arg0[DeriveEpochSymbol];
		}

		return arg0[DerivePlanSymbol];
	}

	public static epoch(now?: Date): DeriveEpoch {
		return { [DeriveEpochSymbol]: { next: now ?? new Date() } };
	}

	private static parseSchedule(
		schedule: DeriveSchedule,
		now?: Date,
	): CronExpression {
		return CronExpressionParser.parse(
			`${schedule.minute ?? "*"} ${schedule.hour ?? "*"} ${schedule.day ?? "*"} ${schedule.week ?? "*"} ${schedule.month ?? "*"}`,
			typeof now !== "undefined" ? { currentDate: now } : {},
		);
	}

	private pending(schedule: DeriveSchedule, now: Date): boolean {
		const parsed = Derive.parseSchedule(schedule, now);

		// obtain current slot by progressing once, and then going back
		parsed.next();
		const prev = parsed.prev().toDate();

		return prev >= now;
	}

	public async wait(
		epoch: DeriveEpoch,
		options?:
			| {
					signal?: AbortSignal | undefined;
					late?: "throw" | undefined;
			  }
			| undefined,
	): Promise<DeriveEpoch> {
		const next = this.next(epoch);
		const peeked = Derive.peek(next);

		const waited = new Promise<DeriveEpoch>((resolve) => {
			const now = new Date();
			const delay = peeked.next.getTime() - now.getTime();
			if (delay <= 0) {
				switch (options?.late) {
					case "throw":
						throw new DeriveWaitLateError(peeked.next, now);
					case undefined:
						logger.warn("late for slot", { desired: peeked.next, now });
						break;
				}

				resolve(next);
			} else {
				setTimeout(() => resolve(next), delay);
			}
		});
		const aborted = new Promise<DeriveEpoch>((_, reject) =>
			options?.signal?.addEventListener("abort", () =>
				reject(options?.signal?.reason),
			),
		);

		return await Promise.race([waited, aborted]);
	}

	public next(epoch: DeriveEpoch): DeriveEpoch {
		const peeked = Derive.peek(epoch);

		let next: Date | undefined;
		for (const { schedule } of this.identified.values()) {
			const parsed = Derive.parseSchedule(schedule, peeked.next);

			const date = parsed.next().toDate();
			if (typeof next === "undefined" || date < next) {
				next = date;
			}
		}

		return {
			[DeriveEpochSymbol]: {
				// biome-ignore lint/style/noNonNullAssertion: constructor enforces that `identified` has at least one element
				next: next!,
			},
		};
	}

	public plan(epoch: DeriveEpoch): DerivePlan<DB> {
		const { next } = Derive.peek(epoch);

		// derivables that need to run due to their own schedule, or due to schedule of
		// other derivables that list them as prerequisites
		const candidates: Map<symbol, Derivable<DB>> = new Map();
		const reasons: Map<symbol, Set<DerivePlanStrategyInnerReason>> = new Map();

		{
			// derivable → derivables listing that derivable as prerequisite
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

			// handle derivables that are neither listed as prerequisites, nor have prerequisites themselves
			for (const [identifier, derivable] of this.identified) {
				if (dependencies.has(identifier)) {
					continue;
				}

				if ((this.prerequisites.get(identifier)?.length ?? 0) !== 0) {
					continue;
				}

				if (!this.pending(derivable.schedule, next)) {
					continue;
				}

				candidates.set(identifier, derivable);
				reasons.set(identifier, new Set(["schedule"]));
			}
		}

		// https://en.wikipedia.org/wiki/Depth-first_search
		{
			const discovered = new Set<symbol>();
			// cycle detection
			const visiting = new Set<symbol>();
			const ordered: Derivable<DB>[] = [];

			const visit = (identifier: symbol): Maybe<DerivePlanUnachievable> => {
				const derivable = candidates.get(identifier);
				if (typeof derivable === "undefined") {
					return null;
				}

				if (discovered.has(identifier)) {
					return null;
				}

				if (visiting.has(identifier)) {
					return { kind: "circulary-prerequisites" };
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
				ordered.push(derivable);

				return null;
			};

			for (const identifier of candidates.keys()) {
				const result = visit(identifier);
				if (isSome(result)) {
					return result;
				}
			}

			return { [DerivePlanSymbol]: { pending: ordered, reasons } };
		}
	}

	async *act(
		strategy: DerivePlanStrategy<DB>,
	): AsyncIterable<DeriveDeriveActStatus> {
		const peeked = strategy[DerivePlanSymbol];
		for (const derivable of peeked.pending) {
			yield { kind: "pending", id: derivable.id };

			// description is used as external identifier
			const description = derivable.id.description;
			if (typeof description === "undefined") {
				logger.warn(`undefined description for derivable <${derivable}>`, {
					derivable,
				});
			}

			try {
				const start = hrtime.bigint();
				await this.database.begin("w", derivable.derive);
				const end = hrtime.bigint();

				yield { kind: "success", id: derivable.id, took: end - start };

				if (typeof description !== "undefined") {
					this.metrics.runs.increment({ id: description, result: "success" });
					this.metrics.runDuration.observe(
						{ id: description },
						Number((end - start) / 1_000_000n) / 1000,
					);
				}
			} catch (error) {
				yield { kind: "error", id: derivable.id, error };

				if (typeof description !== "undefined") {
					this.metrics.runs.increment({ id: description, result: "failure" });
				}
			}
		}
	}
}
