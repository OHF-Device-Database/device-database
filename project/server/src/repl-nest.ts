import { repl } from "@nestjs/core";

import { ModuleApp } from "./layer/app.module";
import { unroll } from "./utility/iterable";
import { SuspendableHandle } from "./service/suspendable";

void (async () => {
	const r = await repl(ModuleApp);
	Object.assign(r.context, { unroll, SuspendableHandle });
	r.setupHistory(".nestjs_repl_history", () => {});
})();
