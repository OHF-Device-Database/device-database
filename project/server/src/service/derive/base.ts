import { createType } from "@lppedd/di-wise-neo";

export interface DeriveDerivableInstance {
	derive(): Promise<void>;
}

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
export type DeriveSchedule = {
	minute?: Minute | `*` | `*/${Minute}`;
	hour?: Hour | `*` | `*/${Hour}`;
	day?: Day | `*` | `*/${Day}`;
	week?: Week | `*` | `*/${Week}`;
	month?: Month | `*` | `*/${Month}`;
};

interface _DeriveDerivableClass {
	// biome-ignore lint/suspicious/noExplicitAny: can't constrain further
	new (...args: any[]): DeriveDerivableInstance;

	get id(): symbol;
	schedule?: DeriveSchedule;

	/* identifiers of derivables that should be satisfied before deriving */
	get prerequisites(): readonly symbol[];
}

export type DeriveDerivable<_C extends _DeriveDerivableClass> =
	InstanceType<_DeriveDerivableClass>;

export const IDeriveDerivable =
	createType<DeriveDerivableInstance>("IDeriveDerivable");
