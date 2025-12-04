import { createType, inject } from "@lppedd/di-wise-neo";
import { Counter, collectDefaultMetrics, Gauge, Registry } from "prom-client";

import { IDatabase } from "../database";

import type { BoundQuery } from "../database/query";

type IntrospectionMetricDescriptor<LabelNames extends string[]> = {
	name: string;
	help: string;
	labelNames: LabelNames;
};

type IntrospectionMetricCounter<
	Labels extends Record<string, string | number>,
> = {
	increment(labels: Labels, by?: number): void;
};

type IntrospectionMetricGaugeCollect<
	Labels extends Record<string, string | number>,
> = {
	set(labels: Labels, value: number): void;
};

export interface IIntrospection {
	metric: {
		counter: <const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
		) => IntrospectionMetricCounter<
			Record<LabelNames[number], string | number>
		>;

		gauge<const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
			collect: (
				collector: IntrospectionMetricGaugeCollect<
					Record<LabelNames[number], string | number>
				>,
			) => Promise<void>,
		): void;
	};

	assertHealthy(): Promise<void>;
}

export const IIntrospection = createType<IIntrospection>("IIntrospection");

export class Introspection implements IIntrospection {
	protected registry: Registry;

	constructor(private db = inject(IDatabase)) {
		this.registry = new Registry();
		collectDefaultMetrics({ register: this.registry });
	}

	private metricCounter<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
	): IntrospectionMetricCounter<Record<LabelNames[number], string | number>> {
		const metric = new Counter(descriptor);
		this.registry.registerMetric(metric);
		return {
			increment: (
				labels: Record<LabelNames[number], string | number>,
				by?: number,
			) => {
				metric.inc(labels, by);
			},
		};
	}

	private metricGauge<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
		collect: (
			collector: IntrospectionMetricGaugeCollect<
				Record<LabelNames[number], string | number>
			>,
		) => Promise<void>,
	) {
		const metric = new Gauge({
			...descriptor,
			async collect() {
				await collect({
					set: (labels: Record<LabelNames[number], string | number>, value) => {
						this.set(labels, value);
					},
				});
			},
		});
		this.registry.registerMetric(metric);
	}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
	};

	async assertHealthy(): Promise<void> {
		await Promise.all([
			(async () => {
				const bound: BoundQuery<"one", "w", never> = {
					name: "GetHealth",
					query: "select 1",
					parameters: [],
					connectionMode: "w",
					resultMode: "one",
					rowMode: "tuple",
					integerMode: "number",
				};

				await this.db.run(bound);
			})(),
		]);
	}
}
