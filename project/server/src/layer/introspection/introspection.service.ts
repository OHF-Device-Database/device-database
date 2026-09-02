import { Injectable } from "@nestjs/common";

import {
	Introspection,
	type IntrospectionRegistry,
} from "../../service/introspect";
import { progressively } from "../../utility/progressively";

/** exposes the otherwise encapsulated registries for scraping */
@Injectable()
export class ServiceIntrospection extends Introspection {
	contentType(registry: IntrospectionRegistry): string {
		return this.registries[registry].contentType;
	}

	metrics(registry: IntrospectionRegistry): Promise<string> {
		return this.registries[registry].metrics();
	}

	/** metrics of every registry, yielded in the order they are collected in */
	metricsCombined(): AsyncIterable<string> {
		return progressively(
			Object.values(this.registries).map((registry) => registry.metrics()),
		);
	}
}
