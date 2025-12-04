import type { IIntrospection, IntrospectionMetricCounter } from ".";

export class StubIntrospection implements IIntrospection {
	private metricCounter<
		const LabelNames extends string[],
	>(): IntrospectionMetricCounter<Record<LabelNames[number], string | number>> {
		return {
			increment: () => {},
		};
	}

	private metricGauge() {}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
	};

	async assertHealthy(): Promise<void> {
		return;
	}
}
