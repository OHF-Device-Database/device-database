import { repl } from "@nestjs/core";

import { globals } from "./inspectable";
import { ModuleApp } from "./layer/app.module";

void (async () => {
	const r = await repl(ModuleApp);
	Object.assign(r.context, globals);
	r.setupHistory(".nestjs_repl_history", () => {});
})();
