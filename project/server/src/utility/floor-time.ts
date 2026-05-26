/** truncated provided time (or current time when not provided) to second */
export const floorTime = (at?: Date) =>
	new Date(Math.floor((at?.getTime() ?? Date.now()) / 1000) * 1000);
