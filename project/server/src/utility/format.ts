export const formatNs = (ns: bigint) =>
	String((Number(ns / 1_000_000n) / 1_000).toFixed(3));
