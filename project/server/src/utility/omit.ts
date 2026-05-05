export const omit = <T extends Record<string, unknown>, O extends keyof T>(
	from: T,
	omit: O,
): Omit<T, typeof omit> => {
	const { [omit]: _, ...rest } = from;
	return rest;
};
