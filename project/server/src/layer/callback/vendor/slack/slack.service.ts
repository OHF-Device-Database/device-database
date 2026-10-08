import { Injectable } from "@nestjs/common";

import { CallbackVendorSlack } from "../../../../service/callback/vendor/slack";

@Injectable()
export class ServiceCallbackVendorSlack extends CallbackVendorSlack {}
