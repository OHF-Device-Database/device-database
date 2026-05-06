import { type BinaryLike, createHash } from "node:crypto";

const bigintToBuf = (n: bigint) => {
	let hex = n.toString(16);
	// `Buffer.from` requires even-length input
	if (hex.length % 2) {
		// biome-ignore lint/style/useTemplate: faster
		hex = "0" + hex;
	}

	return Buffer.from(hex, "hex");
};

type CommutativeHash = {
	update: (data: BinaryLike) => void;
	digest: () => Buffer<ArrayBufferLike>;
};

/** order independent hash, only for non-adversarial use */
export const commutativeHash = (algorithm: string): CommutativeHash => {
	let total = 0n;

	const update = (data: BinaryLike) => {
		const digest = createHash(algorithm).update(data).digest();
		// biome-ignore lint/style/useTemplate: faster
		total += BigInt("0x" + digest.toString("hex"));
	};

	return {
		update,
		digest: () => createHash(algorithm).update(bigintToBuf(total)).digest(),
	};
};
