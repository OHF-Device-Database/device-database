import { availableParallelism } from "node:os";

import { Module } from "@nestjs/common";

import {
	DatabaseSwappable,
	type IDatabaseSwappable,
} from "../../service/database";
import { DatabaseDomain } from "../../service/database/domain";
import { Config, ModuleConfig } from "../config/config.module";
import { ModuleIntrospection } from "../introspection/introspection.module";
import { ServiceIntrospection } from "../introspection/introspection.service";

import type { DatabaseName } from "../../service/database/base";
import type { Introspection } from "../../service/introspect";

export const DatabaseStaging = Symbol("DatabaseStaging");
export const DatabaseDerived = Symbol("DatabaseDerived");

export const Databases = Symbol("Databases");
export type Databases = readonly IDatabaseSwappable<DatabaseName>[];

@Module({
	imports: [ModuleConfig, ModuleIntrospection],
	providers: [
		{
			provide: DatabaseStaging,
			useFactory: (c: Config, introspection: Introspection) => {
				const parallelism = availableParallelism();

				return new DatabaseSwappable(
					"staging",
					new DatabaseDomain(
						c.database.domain.staging.path,
						c.database.domain.staging.readOnly,
					),
					{},
					parallelism,
					introspection,
				);
			},
			inject: [Config, ServiceIntrospection],
		},
		{
			provide: DatabaseDerived,
			useFactory: (c: Config, introspection: Introspection) =>
				new DatabaseSwappable(
					"derived",
					new DatabaseDomain(
						c.database.domain.derived.path,
						c.database.domain.derived.readOnly,
					),
					{
						staging: new DatabaseDomain(c.database.domain.staging.path, true),
					},
					availableParallelism(),
					introspection,
				),
			inject: [Config, ServiceIntrospection],
		},
		{
			provide: Databases,
			useFactory: (
				staging: IDatabaseSwappable<"staging">,
				derived: IDatabaseSwappable<"derived">,
			) => [staging, derived] satisfies Databases,
			inject: [DatabaseStaging, DatabaseDerived],
		},
	],
	exports: [DatabaseStaging, DatabaseDerived, Databases],
})
export class ModuleDatabase {}
