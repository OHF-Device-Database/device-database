import { repl } from "@nestjs/core";

import { ModuleApp } from "./layer/app.module";

void (async () => {
	const r = await repl(ModuleApp);
	r.setupHistory(".nestjs_repl_history", () => {});
})();
