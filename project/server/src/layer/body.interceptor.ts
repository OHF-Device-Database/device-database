import type {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
} from "@nestjs/common";
import { Inject, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import {
	RequestBodyTooLargeError,
	ROUTE_BODY_STREAM,
	StreamedBody,
	type StreamedRequest,
	TransformRequestBodyLimit,
} from "./body";

/** applies the cap requested in `@StreamedBody` */
@Injectable()
export class InterceptorRouteBody implements NestInterceptor {
	constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler<unknown>,
	): Observable<unknown> {
		if (context.getType() !== "http") {
			return next.handle();
		}

		// absent on any handler that does not declare `@StreamedBody`
		const limit = this.reflector.get(StreamedBody, context.getHandler());
		if (typeof limit === "undefined") {
			return next.handle();
		}

		const request = context.switchToHttp().getRequest<StreamedRequest>();

		request[ROUTE_BODY_STREAM] = request.pipe(
			new TransformRequestBodyLimit(limit),
		);

		return next
			.handle()
			.pipe(
				catchError((error: unknown) =>
					throwError(() =>
						error instanceof RequestBodyTooLargeError
							? new PayloadTooLargeException()
							: error,
					),
				),
			);
	}
}
