import { createType } from "@lppedd/di-wise-neo";

import type { DatabaseTransaction } from "../database";
import type { DatabaseName } from "../database/base";

export interface DeriveDerivableInstance<DB extends DatabaseName | undefined> {
	derive(t: DatabaseTransaction<DB, "w">): Promise<void>;
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

interface _DeriveDerivableClass<DB extends DatabaseName | undefined> {
	// biome-ignore lint/suspicious/noExplicitAny: can't constrain further
	new (...args: any[]): DeriveDerivableInstance<DB>;

	get id(): symbol;
	get schedule(): DeriveSchedule;

	/* identifiers of derivables that should be satisfied before deriving */
	get prerequisites(): readonly symbol[];
}

export type DeriveDerivable<
	DB extends DatabaseName | undefined,
	_C extends _DeriveDerivableClass<DB>,
> = InstanceType<_DeriveDerivableClass<DB>>;

export const IDeriveDerivable =
	createType<DeriveDerivableInstance<"derived">>("IDeriveDerivable");
