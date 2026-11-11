import { createType } from "@lppedd/di-wise-neo";

/** drops elements of `T` assignable to `U` */
type Filter<T extends readonly unknown[], U> = T extends readonly [
	infer Head,
	...infer Tail,
]
	? Head extends U
		? Filter<Tail, U>
		: [Head, ...Filter<Tail, U>]
	: [];

type ZeroToSix = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type ZeroToNine = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type OneToFive = 1 | 2 | 3 | 4 | 5;
type OneToNine = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type ZeroToOne = 0 | 1;
type ZeroToTwo = 0 | 1 | 2;
type ZeroToThree = 0 | 1 | 2 | 3;
type Minute = `${ZeroToNine}` | `${OneToFive}${ZeroToNine}`;
type Hour = `${ZeroToNine}` | `1${ZeroToNine}` | `2${ZeroToThree}`;
type Day =
	| `${ZeroToNine}`
	| `1${ZeroToNine}`
	| `2${ZeroToNine}`
	| `3${ZeroToOne}`
	| `*`;
type Week = `${ZeroToSix}`;
type Month = `${OneToNine}` | `1${ZeroToTwo}`;
export type SchedulerSchedule = {
	minute?: Minute | `*` | `*/${Minute}`;
	hour?: Hour | `*` | `*/${Hour}`;
	day?: Day | `*` | `*/${Day}`;
	week?: Week | `*` | `*/${Week}`;
	month?: Month | `*` | `*/${Month}`;
};

/** identifies a scheduled unit and the value it provides to scheduled units listing it as prerequisite */
export type SchedulerScheduledDescriptor<
	Id extends symbol = symbol,
	Provides = void,
> = {
	readonly id: Id;
	readonly provides: Provides;
};
type _SchedulerScheduledDescriptor = SchedulerScheduledDescriptor<
	symbol,
	unknown
>;

/** values provided by {@link SchedulerScheduledDescriptor}, keyed by identifier */
export type SchedulerScheduledContext<
	Descriptors extends readonly _SchedulerScheduledDescriptor[],
> = {
	readonly [D in Descriptors[number] as D["id"]]: D["provides"];
};

type _SchedulerScheduledInstance<
	Descriptor extends _SchedulerScheduledDescriptor,
	Prerequisites extends readonly _SchedulerScheduledDescriptor[],
> = {
	run(
		context: SchedulerScheduledContext<
			// exclude self
			Filter<Prerequisites, Descriptor>
		>,
	): Promise<Descriptor["provides"]> | Descriptor["provides"];
};

type _SchedulerScheduledPrerequisites<
	Descriptor extends _SchedulerScheduledDescriptor,
	Prerequisites extends readonly _SchedulerScheduledDescriptor[],
> =
	// prerequisite descriptors unstated, nothing to constrain against
	number extends Prerequisites["length"]
		? readonly symbol[]
		: Readonly<
				Filter<
					{ [Index in keyof Prerequisites]: Prerequisites[Index]["id"] },
					// exclude self
					Descriptor["id"]
				>
			>;

interface _SchedulerScheduledClass<
	Descriptor extends _SchedulerScheduledDescriptor,
	Prerequisites extends readonly _SchedulerScheduledDescriptor[],
> {
	// biome-ignore lint/suspicious/noExplicitAny: can't constrain further
	new (...args: any[]): _SchedulerScheduledInstance<Descriptor, Prerequisites>;

	get id(): Descriptor["id"];
	schedule?: SchedulerSchedule;

	/* identifiers of scheduled units that should be run before running scheduled unit */
	get prerequisites(): _SchedulerScheduledPrerequisites<
		Descriptor,
		Prerequisites
	>;
}

export type SchedulerScheduled<
	_C extends _SchedulerScheduledClass<Descriptor, Prerequisites>,
	Descriptor extends
		_SchedulerScheduledDescriptor = SchedulerScheduledDescriptor<symbol, void>,
	Prerequisites extends
		readonly _SchedulerScheduledDescriptor[] = readonly _SchedulerScheduledDescriptor[],
> = _SchedulerScheduledInstance<Descriptor, Prerequisites>;

export type SchedulerScheduledRunContext = Readonly<Record<symbol, unknown>>;
export interface SchedulerScheduledInstance {
	run(context: SchedulerScheduledRunContext): Promise<unknown> | unknown;
}

export const ISchedulerScheduled = createType<SchedulerScheduledInstance>(
	"ISchedulerScheduled",
);
