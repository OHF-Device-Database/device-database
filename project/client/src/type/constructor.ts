// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type -- can't be described more accurately
export type Constructor<T = {}> = new (...args: any[]) => T;
