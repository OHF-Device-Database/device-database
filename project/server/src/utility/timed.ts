import { hrtime } from "node:process";

export const timed = async (
	measuring: () => Promise<unknown>,
): Promise<bigint> => {
	const start = hrtime.bigint();
	await measuring();
	return hrtime.bigint() - start;
};
