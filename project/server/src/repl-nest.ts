import { repl } from "@nestjs/core";

import { ModuleApp } from "./layer/app.module";
import { SuspendableHandle } from "./service/suspendable";
import { unroll } from "./utility/iterable";

void (async () => {
	const r = await repl(ModuleApp);
	Object.assign(r.context, { unroll, SuspendableHandle });
	r.setupHistory(".nestjs_repl_history", () => {});
})();
