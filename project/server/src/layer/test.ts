import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { EMPTY } from "rxjs";

import { InterceptorRouteRequest } from "./request.interceptor";

import type { DecodedRequest } from "./route";

// only the sections a codec and the parameter decorators read matter, so stub rather than taken from platform adapter
export type RequestStub = DecodedRequest & {
	readonly headers?: Readonly<Record<string, string>> | undefined;
	readonly rawBody?: Buffer | undefined;
	/** whatever else an adapter leaves behind  (e.g. `params`, `query`, `body`, ...) */
	readonly [section: string]: unknown;
};

/** the http context nest enters an interceptor and a handler with */
export const executionContext = (
	handler: unknown,
	request: RequestStub,
): ExecutionContext =>
	({
		getType: () => "http",
		getHandler: () => handler,
		switchToHttp: () => ({ getRequest: () => request }),
	}) as unknown as ExecutionContext;

const next: CallHandler<unknown> = { handle: () => EMPTY };

const interceptContext = (context: ExecutionContext): void => {
	new InterceptorRouteRequest(new Reflector()).intercept(context, next);
};

/** decodes onto the request the way the interceptor does before a handler is entered */
export const intercept = (handler: unknown, request: RequestStub): void => {
	interceptContext(executionContext(handler, request));
};

/** an evaluated parameter decorator */
type RouteArgument = {
	readonly index: number;
	readonly factory: (data: unknown, context: ExecutionContext) => unknown;
	readonly data: unknown;
};

type ControllerClass = new (...args: never[]) => unknown;

/** the parameter decorators a handler declares, in the positions they are bound to */
export const routeArguments = (
	controller: ControllerClass,
	propertyKey: string,
): readonly RouteArgument[] =>
	Object.values(
		(Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, propertyKey) ??
			{}) as Readonly<Record<string, RouteArgument>>,
	).sort((left, right) => left.index - right.index);

/** invokes handler by running request interceptor first, then handler with every parameter decorator resolved against the same request */
export const invoke = <Controller extends object>(
	controller: Controller,
	propertyKey: keyof Controller & string,
	request: RequestStub,
): unknown => {
	const handler = controller[propertyKey] as unknown as (
		this: Controller,
		...args: readonly unknown[]
	) => unknown;
	const context = executionContext(handler, request);

	interceptContext(context);

	return handler.apply(
		controller,
		routeArguments(controller.constructor as ControllerClass, propertyKey).map(
			({ factory, data }) => factory(data, context),
		),
	);
};
