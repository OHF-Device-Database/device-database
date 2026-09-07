import type { ICallbackVendorSlack } from "../../../../service/callback/vendor/slack";

export const CallbackVendorSlack = Symbol("CallbackVendorSlack");
export type CallbackVendorSlack = ICallbackVendorSlack;
