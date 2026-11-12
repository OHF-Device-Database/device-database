import { availableParallelism } from "node:os";

import { Module } from "@nestjs/common";

import { DatabaseSwappable, type IDatabase } from "../../service/database";
import { DatabaseDomain } from "../../service/database/domain";
import { Config, ModuleConfig } from "../config/config.module";
import { ModuleIntrospection } from "../introspection/introspection.module";
import { ServiceIntrospection } from "../introspection/introspection.service";

import type { DatabaseName } from "../../service/database/base";
import type { Introspection } from "../../service/introspect";

export const DatabaseStaging = Symbol("DatabaseStaging");
export const DatabaseDerived = Symbol("DatabaseDerived");

export const Databases = Symbol("Databases");
/**
 * swapping is driven by whatever built the generation rather than by a consumer resolving the
 * database, so only the plain surface is handed out
 */
export type Databases = readonly IDatabase<DatabaseName>[];

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
					{
						default: parallelism,
						background: Math.max(Math.floor(parallelism / 2), 1),
					},
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
						// whoever owns the domain swaps generations in and discards what they replace,
						// so a second writer would lose whatever it put into the one on its way out
						staging: new DatabaseDomain(c.database.domain.staging.path, true),
					},
					{ default: availableParallelism(), background: 1 },
					introspection,
				),
			inject: [Config, ServiceIntrospection],
		},
		{
			provide: Databases,
			useFactory: (
				staging: IDatabase<"staging">,
				derived: IDatabase<"derived">,
			) => [staging, derived] satisfies Databases,
			inject: [DatabaseStaging, DatabaseDerived],
		},
	],
	exports: [DatabaseStaging, DatabaseDerived, Databases],
})
export class ModuleDatabase {}
