import type { SchedulerScheduledInstance } from "../../service/scheduler/base";

export const SchedulerScheduled = Symbol("SchedulerScheduled");
export type SchedulerScheduled = readonly SchedulerScheduledInstance[];
