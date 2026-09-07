import { type DynamicModule, Module } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { isNone } from "../../../../type/maybe";
import { Config, ModuleConfig } from "../../../config/config.module";
import { ModuleSnapshotDeferIngest } from "../../../snapshot/defer/ingest.module";
import { ServiceSnapshotDeferIngest } from "../../../snapshot/defer/ingest.service";
import { ControllerCallbackVendorSlack } from "./slack.controller";
import { CallbackVendorSlack } from "./slack.interface";
import { ServiceCallbackVendorSlack } from "./slack.service";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: nestjs convention
export class ModuleCallbackVendorSlack {
	static forRoot(config: PickDeep<Config, "vendor.slack">): DynamicModule {
		if (isNone(config.vendor.slack)) {
			// route stays registered so that it can report the callback as unconfigured
			return {
				module: ModuleCallbackVendorSlack,
				controllers: [ControllerCallbackVendorSlack],
			};
		}

		return {
			global: true,
			module: ModuleCallbackVendorSlack,
			imports: [ModuleConfig, ModuleSnapshotDeferIngest],
			controllers: [ControllerCallbackVendorSlack],
			providers: [
				{
					provide: CallbackVendorSlack,
					inject: [Config, ServiceSnapshotDeferIngest],
					useFactory: (
						config: PickDeep<Config, "vendor.slack">,
						ingest: ServiceSnapshotDeferIngest,
					) => {
						// guarded by `forRoot`
						if (isNone(config.vendor.slack)) {
							throw new Error("unreachable");
						}

						return new ServiceCallbackVendorSlack(
							{
								signingKey: config.vendor.slack.callback.signingKey,
								botToken: config.vendor.slack.botToken,
							},
							ingest,
						);
					},
				},
			],
			exports: [CallbackVendorSlack],
		};
	}
}
