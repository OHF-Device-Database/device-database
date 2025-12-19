import type {
	IIntrospection,
	IntrospectionMetricCounter,
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

	private metricHistogram<
		const LabelNames extends string[],
	>(): IntrospectionMetricHistogram<
		Record<LabelNames[number], string | number>
	> {
		return {
			took: () => {},
		};
	}

	private metricGauge() {}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
		histogram: this.metricHistogram.bind(this),
	};
}
