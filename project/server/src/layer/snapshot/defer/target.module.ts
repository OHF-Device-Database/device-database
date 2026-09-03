import { type DynamicModule, Module, type Type } from "@nestjs/common";

import type { _ModuleSnapshotDeferTarget } from "./target.interface";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: nestjs convention
export class ModuleSnapshotDeferTarget {
	static forRoot(adapter: Type<_ModuleSnapshotDeferTarget>): DynamicModule {
		return {
			global: true,
			module: ModuleSnapshotDeferTarget,
			imports: [adapter],
			exports: [adapter],
		};
	}
}
