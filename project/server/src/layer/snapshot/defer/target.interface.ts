import type { ISnapshotDeferTarget } from "../../../service/snapshot/defer/base";

export const SnapshotDeferTarget = Symbol("SnapshotDeferTarget");
export type SnapshotDeferTarget = ISnapshotDeferTarget;

/**
 * nominal marker for modules that export {@link SnapshotDeferTarget}.
 *
 * the `protected` member is never assigned — it only exists so that solely
 * subclasses are assignable, letting the composition root be constrained to
 * modules that claim to provide the port.
 */
export abstract class _ModuleSnapshotDeferTarget {
	protected declare readonly provides: SnapshotDeferTarget;
}
