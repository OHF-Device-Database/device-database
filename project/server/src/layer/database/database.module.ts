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
export const DatabaseIndex = Symbol("DatabaseIndex");

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
			provide: DatabaseIndex,
			useFactory: (c: Config, introspection: Introspection) =>
				new DatabaseSwappable(
					"index",
					new DatabaseDomain(
						c.database.domain.index.path,
						c.database.domain.index.readOnly,
					),
					{
						derived: new DatabaseDomain(c.database.domain.derived.path, true),
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
				index: IDatabaseSwappable<"index">,
			) => [staging, derived, index] satisfies Databases,
			inject: [DatabaseStaging, DatabaseDerived, DatabaseIndex],
		},
	],
	exports: [DatabaseStaging, DatabaseDerived, DatabaseIndex, Databases],
})
export class ModuleDatabase {}
