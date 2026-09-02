import { Controller, Inject } from "@nestjs/common";

import { Route } from "../route";
import { ServiceHealth } from "./health.service";

import type { Implements } from "../schema";

@Controller()
export class ControllerHealth implements Implements<"/api/v1/health"> {
	constructor(@Inject(ServiceHealth) private readonly service: ServiceHealth) {}

	@Route("get", "/api/v1/health")
	async get() {
		await this.service.assertHealthy();
		return { code: 200, contentType: "text/plain", body: "ok" } as const;
	}
}
