import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

declare const HttpResponseTag: unique symbol;

/**
 * opaque handle to the underlying platform's response object
 *
 * actual shape depends on the installed http adapter
 */
export interface HttpResponse {
	readonly [HttpResponseTag]: unknown;
}

export const RequestPath = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) =>
		ctx.switchToHttp().getRequest<Request>().originalUrl,
);
