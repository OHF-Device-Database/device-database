import { availableParallelism } from "node:os";

import { Module } from "@nestjs/common";

import { Database, type IDatabase } from "../../service/database";
import { bake, type DatabaseName } from "../../service/database/base";
import { StubIntrospection } from "../../service/introspect/stub";
import { Config, ModuleConfig } from "../config/config.module";

export const DatabaseStaging = Symbol("DatabaseStaging");
export const DatabaseDerived = Symbol("DatabaseDerived");

export const Databases = Symbol("Databases");
export type Databases = readonly {
	database: IDatabase<DatabaseName>;
	workerCount: { default: number; background: number };
}[];

const maybeURL = (s: string) => {
	try {
		return new URL(s);
	} catch {
		return s;
	}
};

@Module({
	imports: [ModuleConfig],
	providers: [
		{
			provide: DatabaseStaging,
			useFactory: (c: Config) =>
				new Database(
					"staging",
					bake({ location: maybeURL(c.database.path.staging) }),
					{},
					new StubIntrospection(),
				),
			inject: [Config],
		},
		{
			provide: DatabaseDerived,
			useFactory: (c: Config) =>
				new Database(
					"derived",
					bake({ location: maybeURL(c.database.path.derived) }),
					{
						staging: bake({
							location: maybeURL(c.database.path.staging),
							readOnly: true,
						}),
					},
					new StubIntrospection(),
				),
			inject: [Config],
		},
		{
			provide: Databases,
			useFactory: (
				staging: IDatabase<"staging">,
				derived: IDatabase<"derived">,
			) => {
				const parallelism = availableParallelism();
				return [
					{
						database: staging,
						workerCount: {
							default: parallelism,
							background: Math.max(Math.floor(parallelism / 2), 1),
						},
					},
					{
						database: derived,
						workerCount: {
							default: parallelism,
							background: 1,
						},
					},
				] satisfies Databases;
			},
			inject: [DatabaseStaging, DatabaseDerived],
		},
	],
	exports: [DatabaseStaging, DatabaseDerived, Databases],
})
export class ModuleDatabase {}
