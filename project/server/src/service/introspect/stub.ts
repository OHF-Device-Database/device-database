import type {
	IIntrospection,
	IntrospectionMetricCounter,
	IntrospectionMetricDescriptor,
	IntrospectionMetricGauge,
	IntrospectionMetricHistogram,
} from ".";

export class StubIntrospection implements IIntrospection {
	private metricCounter<
		const LabelNames extends string[],
	>(): IntrospectionMetricCounter<Record<LabelNames[number], string | number>> {
		return {
			increment: () => {},
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
		_: IntrospectionMetricDescriptor<LabelNames>,
		collect?: (
			collector: IntrospectionMetricGauge<
				Record<LabelNames[number], string | number>
			>,
		) => Promise<void>,
	):
		| IntrospectionMetricGauge<Record<LabelNames[number], string | number>>
		| undefined {
		if (typeof collect === "undefined") {
			return {
				set: () => {},
			};
		} else {
			return undefined;
		}
	}

	private metricHistogram<
		const LabelNames extends string[],
	>(): IntrospectionMetricHistogram<
		Record<LabelNames[number], string | number>
	> {
		return {
			took: () => {},
		};
	}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
		histogram: this.metricHistogram.bind(this),
	};
}
