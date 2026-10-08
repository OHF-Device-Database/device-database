import type { ISuspendable, SuspendableHandle } from "../suspendable";
import type {
	SchedulerActStatus,
	SchedulerPlan,
	SchedulerPlanStrategy,
} from ".";

export interface ISchedulerCoordinator extends ISuspendable {
	/** identifiers of every registered scheduled unit */
	scheduleable(): Iterable<symbol>;
	plan(id: symbol): SchedulerPlan;
	/** acts on `plan`, holding a suspension for the duration so that scheduled runs can't overlap */
	run(
		plan: SchedulerPlanStrategy,
		handle: SuspendableHandle,
	): AsyncIterable<SchedulerActStatus>;
}
