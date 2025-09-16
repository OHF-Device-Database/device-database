export type Maybe<T> = T | null;

export const isSome = <T>(maybe: Maybe<T>): maybe is T => maybe !== null;
export const isNone = <T>(maybe: Maybe<T>): maybe is null => maybe === null;
