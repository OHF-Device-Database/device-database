import { Inject, Injectable } from "@nestjs/common";

import { DatabaseStaging } from "../database/database.module";

import type { IDatabase } from "../../service/database";

@Injectable()
export class ServiceHealth {
	constructor(
		@Inject(DatabaseStaging) private readonly staging: IDatabase<"staging">,
	) {}

	async assertHealthy() {
		await this.staging.assertHealthy();
	}
}
