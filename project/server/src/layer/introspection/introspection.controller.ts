import { Readable } from "node:stream";

import {
	Controller,
	Get,
	Inject,
	Response,
	StreamableFile,
	UseGuards,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

import { GuardIntrospection } from "./introspection.guard";
import { ServiceIntrospection } from "./introspection.service";

import type { IntrospectionRegistry } from "../../service/introspect";
import type { HttpResponse } from "../http";

/** assumes that all registries emit prometheus-style metrics */
const CONTENT_TYPE_COMBINED = "text/plain; version=0.0.4; charset=utf-8";

async function* delimited(metrics: AsyncIterable<string>) {
	for await (const scoped of metrics) {
		yield `${scoped}\n`;
	}
}

@Controller("metrics")
@UseGuards(GuardIntrospection)
export class ControllerIntrospection {
	constructor(
		@Inject(ServiceIntrospection)
		private readonly introspection: ServiceIntrospection,
		@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
	) {}

	private scoped(
		registry: IntrospectionRegistry,
		response: HttpResponse,
	): Promise<string> {
		this.adapterHost.httpAdapter.setHeader(
			response,
			"content-type",
			this.introspection.contentType(registry),
		);

		return this.introspection.metrics(registry);
	}

	@Get()
	combined(): StreamableFile {
		return new StreamableFile(
			Readable.from(delimited(this.introspection.metricsCombined())),
			{ type: CONTENT_TYPE_COMBINED },
		);
	}

	@Get("local")
	local(
		@Response({ passthrough: true }) response: HttpResponse,
	): Promise<string> {
		return this.scoped("local", response);
	}

	@Get("global")
	global(
		@Response({ passthrough: true }) response: HttpResponse,
	): Promise<string> {
		return this.scoped("global", response);
	}
}
