import { createType } from "@lppedd/di-wise-neo";
import {
	Counter,
	collectDefaultMetrics,
	Gauge,
	Histogram,
	Registry,
} from "prom-client";

const introspectionRegistries = ["local", "global"] as const;
export type IntrospectionRegistry = (typeof introspectionRegistries)[number];

export type IntrospectionMetricDescriptor<LabelNames extends string[]> = {
	name: string;
	help: string;
	labelNames: LabelNames;
	registry: IntrospectionRegistry;
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
	observe(labels: Labels, value: number): void;
};

export class IntrospectConflictingMetricDefinition extends Error {
	constructor(public name: string) {
		super(
			`attempted to register metric <${name}>, which is already registered`,
		);
		Object.setPrototypeOf(
			this,
			IntrospectConflictingMetricDefinition.prototype,
		);
	}
}

export class IntrospectReleasedScopeError extends Error {
	constructor() {
		super("attempted to use a released scope");
		Object.setPrototypeOf(this, IntrospectReleasedScopeError.prototype);
	}
}

export type IIntrospectionScope = {
	/** unregisters every metric registered through this scope and its children, making their names available for registration again */
	release(): void;
} & Disposable;

export interface IIntrospection {
	metric: {
		/** registers a new counter metric */
		counter: <const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptor<LabelNames>,
		) => IntrospectionMetricCounter<
			Record<LabelNames[number], string | number>
		>;

		/** registers a new gauge metric */
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

		/** registers a new histogram metric */
		histogram: <const LabelNames extends string[]>(
			descriptor: IntrospectionMetricDescriptorHistogram<LabelNames>,
		) => IntrospectionMetricHistogram<
			Record<LabelNames[number], string | number>
		>;
	};

	/**
	 * creates a scope whose metrics can be unregistered in one go
	 *
	 * {@link prefix} is prepended to the name of every metric registered through the scope
	 */
	scope(prefix?: string | undefined): IIntrospection & IIntrospectionScope;
}

export const IIntrospection = createType<IIntrospection>("IIntrospection");

type IntrospectionContext = Record<IntrospectionRegistry, Registry>;

const qualify = (prefix: string | undefined, name: string) =>
	typeof prefix === "undefined" ? name : `${prefix}_${name}`;

class IntrospectionScope implements IIntrospection, IIntrospectionScope {
	private readonly claimed: [registry: Registry, name: string][] = [];
	private readonly children = new Set<IntrospectionScope>();
	private released = false;

	constructor(
		private readonly context: IntrospectionContext,
		private readonly prefix: string | undefined,
		/** detaches this scope from its parent when released on its own */
		private readonly detach: (() => void) | undefined,
	) {}

	/** qualifies the name of {@link descriptor} and claims it for this scope, which unregisters it again once released */
	private claim<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
	): [registry: Registry, name: string] {
		if (this.released) {
			throw new IntrospectReleasedScopeError();
		}

		const name = qualify(this.prefix, descriptor.name);
		const registry = this.context[descriptor.registry];

		if (typeof registry.getSingleMetric(name) !== "undefined") {
			throw new IntrospectConflictingMetricDefinition(name);
		}

		this.claimed.push([registry, name]);

		return [registry, name];
	}

	private metricCounter<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptor<LabelNames>,
	): IntrospectionMetricCounter<Record<LabelNames[number], string | number>> {
		const [registry, name] = this.claim(descriptor);

		// registering by construction keeps the metric out of the default registry of `prom-client`
		const metric = new Counter({ ...descriptor, name, registers: [registry] });

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
		const [registry, name] = this.claim(descriptor);

		if (typeof collect === "undefined") {
			// registering by construction keeps the metric out of the default registry of `prom-client`
			const metric = new Gauge({ ...descriptor, name, registers: [registry] });

			return {
				set: (
					labels: Record<LabelNames[number], string | number>,
					value: number,
				) => {
					metric.set(labels, value);
				},
			};
		} else {
			new Gauge({
				...descriptor,
				name,
				registers: [registry],
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

			return undefined;
		}
	}

	private metricHistogram<const LabelNames extends string[]>(
		descriptor: IntrospectionMetricDescriptorHistogram<LabelNames>,
	): IntrospectionMetricHistogram<Record<LabelNames[number], string | number>> {
		const [registry, name] = this.claim(descriptor);

		// registering by construction keeps the metric out of the default registry of `prom-client`
		const metric = new Histogram({
			...descriptor,
			name,
			registers: [registry],
		});

		return {
			observe: (
				labels: Record<LabelNames[number], string | number>,
				value: number | bigint,
			) => {
				const narrowed = typeof value === "bigint" ? Number(value) : value;
				metric.observe(labels, narrowed);
			},
		};
	}

	metric = {
		counter: this.metricCounter.bind(this),
		gauge: this.metricGauge.bind(this),
		histogram: this.metricHistogram.bind(this),
	};

	scope(prefix?: string | undefined): IIntrospection & IIntrospectionScope {
		if (this.released) {
			throw new IntrospectReleasedScopeError();
		}

		const child: IntrospectionScope = new IntrospectionScope(
			this.context,
			typeof prefix === "undefined"
				? this.prefix
				: qualify(this.prefix, prefix),
			() => this.children.delete(child),
		);

		this.children.add(child);

		return child;
	}

	release(): void {
		if (this.released) {
			return;
		}
		this.released = true;

		// `release` removes the child from `this.children` which is therefor empty once iterating concludes
		for (const child of this.children) {
			child.release();
		}

		for (const [registry, name] of this.claimed) {
			registry.removeSingleMetric(name);
		}
		this.claimed.length = 0;

		this.detach?.();
	}

	[Symbol.dispose](): void {
		this.release();
	}
}

export class Introspection implements IIntrospection {
	protected registries: Record<IntrospectionRegistry, Registry>;

	private readonly root: IntrospectionScope;

	metric: IIntrospection["metric"];

	constructor() {
		this.registries = Object.fromEntries(
			introspectionRegistries.map((name) => [name, new Registry()] as const),
		) as Record<IntrospectionRegistry, Registry>;

		this.root = new IntrospectionScope(this.registries, undefined, undefined);

		this.metric = this.root.metric;

		collectDefaultMetrics({ register: this.registries.local });
	}

	scope(prefix?: string | undefined): IIntrospection & IIntrospectionScope {
		return this.root.scope(prefix);
	}
}
