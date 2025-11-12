import { createHmac, timingSafeEqual } from "node:crypto";

import { createType, inject } from "@lppedd/di-wise-neo";
import { differenceInSeconds } from "date-fns";
import { Schema } from "effect";
import { isLeft } from "effect/Either";

import { ConfigProvider } from "../../config";
import { DateFromUnixTime } from "../../type/codec/date";

const VoucherSymbol = Symbol("Voucher");

const SealedVoucherInnerManaged = Schema.Struct({
	role: Schema.String,
	at: DateFromUnixTime,
});
type SealedVoucherInnerManaged = typeof SealedVoucherInnerManaged.Type;

type SealedVoucherInner<
	Role extends string,
	Payload extends Record<string, unknown>,
> = Payload & SealedVoucherInnerManaged & { role: Role };

export type SealedVoucher<
	Role extends string,
	Payload extends Record<string, unknown> = Record<string, never>,
> = {
	[VoucherSymbol]: SealedVoucherInner<Role, Payload>;
};

const DeserializeResultErrorPayloadSymbol = Symbol(
	"DeserializeResultErrorPayloadSymbol",
);

type DeserializeResultSuccess<
	Role extends string,
	Payload extends Record<string, unknown>,
> = {
	kind: "success";
	voucher: SealedVoucher<Role, Payload>;
};
type DeserializeResultErrorRoleMismatch<Payload> = {
	kind: "error";
	cause: "role-mismatch";
	[DeserializeResultErrorPayloadSymbol]: Payload;
};
type DeserializeResultErrorExpired<Payload> = {
	kind: "error";
	cause: "expired";
	epoch: Date;
	[DeserializeResultErrorPayloadSymbol]: Payload;
};
type DeserializeResultErrorMalformed = {
	kind: "error";
	cause: "malformed";
	portion?: "managed" | "unmanaged";
};
type DeserializeResult<
	Role extends string,
	Payload extends Record<string, unknown>,
> =
	| DeserializeResultSuccess<Role, Payload>
	| DeserializeResultErrorRoleMismatch<Payload>
	| DeserializeResultErrorExpired<Payload>;

export interface IVoucher {
	create<Role extends string>(
		role: Role,
		epoch: Date,
	): SealedVoucher<Role, Record<string, never>>;
	create<Role extends string, Payload extends Record<string, unknown>>(
		role: Role,
		epoch: Date,
		payload: Payload,
	): SealedVoucher<Role, Payload>;

	serialize<Role extends string>(
		sealed: SealedVoucher<Role, Record<string, never>>,
	): string;
	serialize<
		Role extends string,
		Payload extends Record<string, unknown>,
		Codec extends Schema.Schema.AnyNoContext,
	>(
		sealed: SealedVoucher<Role, Payload>,
		codec: Schema.Schema.Type<Codec> extends Payload ? Codec : never,
	): string;

	deserialize<Role extends string>(
		serialized: string,
		role: Role,
		ttl: number,
	):
		| DeserializeResult<Role, Record<string, never>>
		| DeserializeResultErrorMalformed;
	deserialize<Role extends string, Codec extends Schema.Schema.AnyNoContext>(
		serialized: string,
		role: Role,
		ttl: number,
		codec: Codec,
	):
		| DeserializeResult<Role, Schema.Schema.Type<Codec>>
		| DeserializeResultErrorMalformed;
}

export const IVoucher = createType<IVoucher>("IVoucher");

export class Voucher implements IVoucher {
	constructor(
		private signingKey: string = inject(ConfigProvider)(
			(c) => c.signing.voucher,
		),
	) {}

	static peek<Role extends string, Payload extends Record<string, unknown>>(
		sealed: SealedVoucher<Role, Payload>,
	): SealedVoucherInner<Role, Payload> {
		return sealed[VoucherSymbol];
	}

	static unwrap<Payload>(
		error:
			| DeserializeResultErrorRoleMismatch<Payload>
			| DeserializeResultErrorExpired<Payload>,
	): Payload {
		return error[DeserializeResultErrorPayloadSymbol];
	}

	create<Role extends string>(
		role: Role,
		epoch: Date,
	): SealedVoucher<Role, Record<string, never>>;
	create<Role extends string, Payload extends Record<string, unknown>>(
		role: Role,
		epoch: Date,
		payload: Payload,
	): SealedVoucher<Role, Payload>;
	create(
		role: string,
		epoch: Date,
		payload?: Record<string, unknown>,
	): SealedVoucher<string, Record<string, unknown>> {
		const ts = epoch?.getTime() ?? Date.now();
		const at = new Date(Math.floor(ts / 1000) * 1000);

		return {
			[VoucherSymbol]: {
				...payload,
				role,
				at,
			},
		};
	}

	deserialize<Role extends string>(
		serialized: string,
		role: Role,
		ttl: number,
	):
		| DeserializeResult<Role, Record<string, never>>
		| DeserializeResultErrorMalformed;
	deserialize<Role extends string, Codec extends Schema.Schema.AnyNoContext>(
		serialized: string,
		role: Role,
		ttl: number,
		codec: Codec,
	):
		| DeserializeResult<Role, Schema.Schema.Type<Codec>>
		| DeserializeResultErrorMalformed;
	deserialize<Role extends string, Codec extends Schema.Schema.AnyNoContext>(
		serialized: string,
		role: Role,
		ttl: number,
		codec?: Codec,
	):
		| DeserializeResult<Role, Record<string, never> | Schema.Schema.Type<Codec>>
		| DeserializeResultErrorMalformed {
		const split = serialized.split("|");
		if (split.length !== 2) {
			return { kind: "error", cause: "malformed" };
		}

		const [signature, signed] = split;
		const signatureDecoded = Buffer.from(signature, "base64url");
		const signedDecoded = Buffer.from(signed, "base64url");

		const hmac = createHmac("sha256", this.signingKey);
		hmac.update(signedDecoded);

		if (!timingSafeEqual(hmac.digest(), signatureDecoded)) {
			return { kind: "error", cause: "malformed" };
		}

		let decodedManaged;
		{
			const decoder = Schema.decodeUnknownEither(
				Schema.parseJson(SealedVoucherInnerManaged),
				{ onExcessProperty: "preserve" },
			);
			decodedManaged = decoder(signedDecoded.toString("utf-8"));
			if (isLeft(decodedManaged)) {
				return { kind: "error", cause: "malformed", portion: "managed" };
			}
		}

		let payload = {};
		decodedUnmanaged: {
			if (typeof codec === "undefined") {
				break decodedUnmanaged;
			}
			const decoder = Schema.decodeUnknownEither(codec);
			const decoded = decoder(decodedManaged.right);
			if (isLeft(decoded)) {
				return { kind: "error", cause: "malformed", portion: "unmanaged" };
			}
			payload = decoded.right;
		}

		if (decodedManaged.right.role !== role) {
			return {
				kind: "error",
				cause: "role-mismatch",
				[DeserializeResultErrorPayloadSymbol]: payload,
			};
		}

		const now = new Date();
		const difference = differenceInSeconds(now, decodedManaged.right.at);
		if (Math.abs(difference) >= ttl) {
			return {
				kind: "error",
				cause: "expired",
				epoch: decodedManaged.right.at,
				[DeserializeResultErrorPayloadSymbol]: payload,
			};
		}

		return {
			kind: "success",
			voucher: this.create(
				decodedManaged.right.role,
				decodedManaged.right.at,
				payload,
			) as
				| SealedVoucher<Role, Record<string, never>>
				| Schema.Schema.Type<Codec>,
		};
	}

	serialize<Role extends string>(
		sealed: SealedVoucher<Role, Record<string, never>>,
	): string;
	serialize<
		Role extends string,
		Payload extends Record<string, unknown>,
		Codec extends Schema.Schema.AnyNoContext,
	>(
		sealed: SealedVoucher<Role, Payload>,
		codec: Schema.Schema.Type<Codec> extends Payload ? Codec : never,
	): string;
	serialize<Role extends string, Payload extends Record<string, unknown>>(
		sealed: SealedVoucher<Role, Payload>,
		codec?: Schema.Schema<Payload>,
	): string {
		const unsealed = sealed[VoucherSymbol];

		let managed;
		let unmanaged;
		{
			const encoder = Schema.encodeSync(SealedVoucherInnerManaged);
			managed = encoder(unsealed);
		}
		if (typeof codec !== "undefined") {
			const encoder = Schema.encodeSync(codec);
			unmanaged = encoder(unsealed);
		}

		const merged = {
			...managed,
			...unmanaged,
		};

		const buffer = Buffer.from(JSON.stringify(merged), "utf8");

		const hmac = createHmac("sha256", this.signingKey);
		hmac.update(buffer);

		return `${hmac.digest("base64url")}|${buffer.toString("base64url")}`;
	}
}
