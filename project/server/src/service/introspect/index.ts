import { createType } from "@lppedd/di-wise-neo";
import {
	Counter,
	collectDefaultMetrics,
	Gauge,
	Histogram,
	Registry,
} from "prom-client";

export type IntrospectionMetricDescriptor<LabelNames extends string[]> = {
	name: string;
	help: string;
	labelNames: LabelNames;
};

type IntrospectionMetricDescriptorHistogram<LabelNames extends string[]> =
	IntrospectionMetricDescriptor<LabelNames> & { buckets: number[] };

export type IntrospectionMetricCounter<
	Labels extends Record<string, string | number>,
> = {
	increment(labels: Labels, by?: number): void;
};

export type IntrospectionMetricGauge<
	Labels extends Record<string, string | number>,
> = {
	set(labels: Labels, value: number): void;
};

export type IntrospectionMetricHistogram<
	Labels extends Record<string, string | number>,
> = {
	took(labels: Labels, durationMs: number): void;
};

export class IntrospectConflictingMetricDefinition extends Error {
	constructor(public name: string) {
		super(`attempted to register metric <${name}> with conflicting type`);
		Object.setPrototypeOf(
			this,
			IntrospectConflictingMetricDefinition.prototype,
		);
	}
}

export interface IIntrospection {
	metric: {
		/**
		 * creates new counter metric, or returns existing one.
		 * labels are _not updated_ when previously registered metric is found
		 * */
		counter: <const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
		) => IntrospectionMetricCounter<
			Record<LabelNames[number], string | number>
		>;

		/** creates new gauge metric, or replaces existing one */
		gauge<const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
		): IntrospectionMetricGauge<Record<LabelNames[number], string | number>>;
		gauge<const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
			collect: (
				collector: IntrospectionMetricGauge<
					Record<LabelNames[number], string | number>
				>,
			) => Promise<void>,
		): void;

		/**
		 * creates new histogram metric, or returns existing one.
		 * labels and buckets are _not updated_ when previously registered metric is found
		 */
		histogram: <const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptorHistogram<LabelNames>,
		) => IntrospectionMetricHistogram<
			Record<LabelNames[number], string | number>
		>;
	};
}

export const IIntrospection = createType<IIntrospection>("IIntrospection");

export class Introspection implements IIntrospection {
	protected registry: Registry;

	constructor() {
		this.registry = new Registry();
		collectDefaultMetrics({ register: this.registry });
	}

	private metricCounter<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
	): IntrospectionMetricCounter<Record<LabelNames[number], string | number>> {
		let metric;
		metric: {
			const existing = this.registry.getSingleMetric(descriptor.name);
			if (typeof existing === "undefined") {
				metric = new Counter(descriptor);
				this.registry.registerMetric(metric);
				break metric;
			}

			if (!(existing instanceof Counter)) {
				throw new IntrospectConflictingMetricDefinition(descriptor.name);
			}

			metric = existing;
		}

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
	): IntrospectionMetricGauge<Record<LabelNames[number], string | number>>;
	private metricGauge<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
		collect: (
			collector: IntrospectionMetricGauge<
				Record<LabelNames[number], string | number>
			>,
		) => Promise<void>,
	): void;
	private metricGauge<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
		collect?: (
			collector: IntrospectionMetricGauge<
				Record<LabelNames[number], string | number>
			>,
		) => Promise<void>,
	):
		| IntrospectionMetricGauge<Record<LabelNames[number], string | number>>
		| undefined {
		if (typeof collect === "undefined") {
			let metric;
			metric: {
				const existing = this.registry.getSingleMetric(descriptor.name);
				if (typeof existing === "undefined") {
					metric = new Gauge(descriptor);
					this.registry.registerMetric(metric);
					break metric;
				}

				if (!(existing instanceof Gauge)) {
					throw new IntrospectConflictingMetricDefinition(descriptor.name);
				}

				metric = existing;
			}

			return {
				set: (
					labels: Record<LabelNames[number], string | number>,
					value: number,
				) => {
					metric.set(labels, value);
				},
			};
		} else {
			this.registry.removeSingleMetric(descriptor.name);

			const metric = new Gauge({
				...descriptor,
				async collect() {
					await collect({
						set: (
							labels: Record<LabelNames[number], string | number>,
							value,
						) => {
							this.set(labels, value);
						},
					});
				},
			});

			this.registry.registerMetric(metric);
			return undefined;
		}
	}

	private metricHistogram<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptorHistogram<LabelNames>,
	): IntrospectionMetricHistogram<Record<LabelNames[number], string | number>> {
		let metric;
		metric: {
			const existing = this.registry.getSingleMetric(descriptor.name);
			if (typeof existing === "undefined") {
				metric = new Histogram(descriptor);
				this.registry.registerMetric(metric);
				break metric;
			}

			if (!(existing instanceof Histogram)) {
				throw new IntrospectConflictingMetricDefinition(descriptor.name);
			}

			metric = existing;
		}

		return {
			took: (
				labels: Record<LabelNames[number], string | number>,
				duration: number | bigint,
			) => {
				const narrowed =
					typeof duration === "bigint" ? Number(duration) : duration;
				metric.observe(labels, narrowed);
			},
		};
	}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
		histogram: this.metricHistogram.bind(this),
	};
}
