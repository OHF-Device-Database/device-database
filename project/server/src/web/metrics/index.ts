import { Hono } from "hono";

import { container } from "../../dependency";
import { IIntrospectionMixinHono } from "../../service/introspect/mixin-hono";

export const router = () => {
	const router = new Hono();

	const introspect = container.resolve(IIntrospectionMixinHono);

	router.get("/", introspect.handler());

	return router;
};
