import { createHmac, timingSafeEqual } from "node:crypto";

import { createType, inject } from "@lppedd/di-wise-neo";
import { differenceInSeconds } from "date-fns";
import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { ConfigProvider } from "../../config";
import { DateFromUnixTime } from "../../type/codec/date";

import type { Maybe } from "../../type/maybe";

const VoucherSymbol = Symbol("Voucher");

const VoucherPurpose = Schema.Literal("database-snapshot", "no-op");
type VoucherPurpose = typeof VoucherPurpose.Type;

const SealedVoucherInner = Schema.Struct({
	purpose: VoucherPurpose,
	createdAt: DateFromUnixTime,
});
type SealedVoucherInner<Purpose extends VoucherPurpose | unknown> =
	typeof SealedVoucherInner.Type & { purpose: Purpose };

export type SealedVoucher<Purpose extends VoucherPurpose> = {
	[VoucherSymbol]: SealedVoucherInner<Purpose>;
};

type SealedVoucherAny = {
	[VoucherSymbol]: SealedVoucherInner<unknown>;
};

/** in seconds */
const validityPeriod = {
	"database-snapshot": 10,
	"no-op": 0,
} as const satisfies Record<VoucherPurpose, number>;

export interface IVoucher {
	create<P extends VoucherPurpose>(purpose: P): SealedVoucher<P>;
	validate(sealed: SealedVoucherAny, purpose: VoucherPurpose): boolean;

	serialize(sealed: SealedVoucherAny): string;
	deserialize(serialized: string): Maybe<SealedVoucherAny>;
}

export const IVoucher = createType<IVoucher>("IVoucher");

export class Voucher implements IVoucher {
	constructor(
		private signingKey: string = inject(ConfigProvider)(
			(c) => c.signing.voucher,
		),
	) {}

	static peek<P extends VoucherPurpose>(
		sealed: SealedVoucher<P>,
	): SealedVoucherInner<P> {
		return sealed[VoucherSymbol];
	}

	create<P extends VoucherPurpose>(sealed: P): SealedVoucher<P> {
		return {
			[VoucherSymbol]: {
				purpose: sealed,
				// rounded to nearest unix timestamp
				createdAt: new Date(Math.floor(Date.now() / 1000) * 1000),
			},
		};
	}

	validate(sealed: SealedVoucherAny, purpose: VoucherPurpose): boolean {
		const peeked = sealed[VoucherSymbol];

		if (peeked.purpose !== purpose) {
			return false;
		}

		const now = new Date();
		const difference = differenceInSeconds(now, peeked.createdAt);
		if (Math.abs(difference) >= validityPeriod[purpose]) {
			return false;
		}

		return true;
	}

	serialize(sealed: SealedVoucherAny): string {
		const encoder = Schema.encodeSync(SealedVoucherInner);
		const encoded = encoder(sealed[VoucherSymbol]);

		const buffer = Buffer.from(JSON.stringify(encoded), "utf8");

		const hmac = createHmac("sha256", this.signingKey);
		hmac.update(buffer);

		return `${hmac.digest("base64url")}|${buffer.toString("base64url")}`;
	}

	deserialize(serialized: string): Maybe<SealedVoucherAny> {
		const split = serialized.split("|");
		if (split.length !== 2) {
			return null;
		}

		const [signature, signed] = split;
		const signatureDecoded = Buffer.from(signature, "base64url");
		const signedDecoded = Buffer.from(signed, "base64url");

		const hmac = createHmac("sha256", this.signingKey);
		hmac.update(signedDecoded);

		if (!timingSafeEqual(hmac.digest(), signatureDecoded)) {
			return null;
		}

		const decoder = Schema.decodeUnknownEither(
			Schema.parseJson(SealedVoucherInner),
		);
		const decoded = decoder(signedDecoded.toString("utf-8"));
		if (isLeft(decoded)) {
			return null;
		}

		return {
			[VoucherSymbol]: decoded.right,
		};
	}
}
