import { type TestContext, test } from "node:test";

import { register as defaultRegistry } from "prom-client";

import {
	IntrospectConflictingMetricDefinition,
	Introspection,
	type IntrospectionRegistry,
	IntrospectReleasedScopeError,
} from ".";

import type { IIntrospection } from ".";

// "local" registry carries default metrics, "global" starts out empty
const registry: IntrospectionRegistry = "global";

class TestIntrospection extends Introspection {
	names(): string[] {
		return this.registries[registry]
			.getMetricsAsArray()
			.map((metric) => metric.name)
			.sort();
	}

	render(): Promise<string> {
		return this.registries[registry].metrics();
	}
}

const counter = (introspection: IIntrospection) => (name: string) =>
	introspection.metric.counter({
		name,
		help: "help",
		labelNames: [],
		registry,
	});

const gauge = (introspection: IIntrospection) => (name: string) =>
	introspection.metric.gauge({ name, help: "help", labelNames: [], registry });

const collectedGauge =
	(introspection: IIntrospection) => (name: string, value: number) =>
		introspection.metric.gauge(
			{ name, help: "help", labelNames: [], registry },
			async (collector) => {
				collector.set({}, value);
			},
		);

const histogram = (introspection: IIntrospection) => (name: string) =>
	introspection.metric.histogram({
		name,
		help: "help",
		labelNames: [],
		buckets: [1],
		registry,
	});

test("scope naming", (t: TestContext) => {
	t.test("prefixes registered metrics", (t: TestContext) => {
		const introspection = new TestIntrospection();

		counter(introspection.scope("database_derived"))("queries_total");

		t.assert.deepStrictEqual(introspection.names(), [
			"database_derived_queries_total",
		]);
	});

	t.test("composes prefixes across nesting", (t: TestContext) => {
		const introspection = new TestIntrospection();

		counter(introspection.scope("database").scope("derived"))("queries_total");

		t.assert.deepStrictEqual(introspection.names(), [
			"database_derived_queries_total",
		]);
	});

	t.test("inherits naming when no prefix is given", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const parent = introspection.scope("database_derived");
		counter(parent.scope())("queries_total");

		t.assert.deepStrictEqual(introspection.names(), [
			"database_derived_queries_total",
		]);
	});

	t.test("leaves the root unprefixed", (t: TestContext) => {
		const introspection = new TestIntrospection();

		counter(introspection)("queries_total");

		t.assert.deepStrictEqual(introspection.names(), ["queries_total"]);
	});
});

test("scope release", (t: TestContext) => {
	t.test("unregisters metrics it registered", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		counter(scope)("queries_total");
		collectedGauge(scope)("queued_total", 1);

		t.assert.deepStrictEqual(introspection.names(), [
			"x_queries_total",
			"x_queued_total",
		]);

		scope.release();

		t.assert.deepStrictEqual(introspection.names(), []);
	});

	t.test("cascades to children", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const parent = introspection.scope("x");
		counter(parent)("parent_total");
		counter(parent.scope("nested"))("child_total");

		t.assert.deepStrictEqual(introspection.names(), [
			"x_nested_child_total",
			"x_parent_total",
		]);

		parent.release();

		t.assert.deepStrictEqual(introspection.names(), []);
	});

	t.test("leaves the parent intact when a child goes", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const parent = introspection.scope("x");
		counter(parent)("parent_total");

		const child = parent.scope("nested");
		counter(child)("child_total");

		child.release();

		t.assert.deepStrictEqual(introspection.names(), ["x_parent_total"]);
	});

	t.test("is idempotent", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const a = introspection.scope("x");
		counter(a)("queries_total");
		a.release();

		const b = introspection.scope("x");
		counter(b)("queries_total");

		// must not unregister what `b` registered under the name in the meantime
		a.release();

		t.assert.deepStrictEqual(introspection.names(), ["x_queries_total"]);
	});

	t.test("drops accumulated values", async (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		counter(scope)("queries_total").increment({}, 5);

		t.assert.match(await introspection.render(), /^x_queries_total 5$/m);

		scope.release();
		counter(introspection.scope("x"))("queries_total");

		t.assert.match(await introspection.render(), /^x_queries_total 0$/m);
	});
});

test("released scope", (t: TestContext) => {
	t.test("refuses to register", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		scope.release();

		t.assert.throws(
			() => counter(scope)("queries_total"),
			IntrospectReleasedScopeError,
		);
	});

	t.test("refuses to derive a scope", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		scope.release();

		t.assert.throws(() => scope.scope(), IntrospectReleasedScopeError);
	});

	t.test("is released along with its parent", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const parent = introspection.scope("x");
		const child = parent.scope("nested");

		parent.release();

		t.assert.throws(
			() => counter(child)("queries_total"),
			IntrospectReleasedScopeError,
		);
	});
});

test("duplicate registration", (t: TestContext) => {
	t.test("conflicts within a scope", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");

		counter(scope)("queries_total");
		t.assert.throws(
			() => counter(scope)("queries_total"),
			IntrospectConflictingMetricDefinition,
		);

		gauge(scope)("pending_total");
		t.assert.throws(
			() => gauge(scope)("pending_total"),
			IntrospectConflictingMetricDefinition,
		);

		collectedGauge(scope)("queued_total", 1);
		t.assert.throws(
			() => collectedGauge(scope)("queued_total", 2),
			IntrospectConflictingMetricDefinition,
		);

		histogram(scope)("query_duration_seconds");
		t.assert.throws(
			() => histogram(scope)("query_duration_seconds"),
			IntrospectConflictingMetricDefinition,
		);
	});

	t.test("conflicts across scopes sharing a name", (t: TestContext) => {
		const introspection = new TestIntrospection();

		counter(introspection.scope("x"))("queries_total");

		t.assert.throws(
			() => counter(introspection.scope("x"))("queries_total"),
			IntrospectConflictingMetricDefinition,
		);
	});

	t.test("conflicts across metric types", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		counter(scope)("queries_total");

		t.assert.throws(
			() => histogram(scope)("queries_total"),
			IntrospectConflictingMetricDefinition,
		);
	});

	t.test("is confined to a single registry", (t: TestContext) => {
		const introspection = new TestIntrospection();

		const scope = introspection.scope("x");
		counter(scope)("queries_total");

		t.assert.doesNotThrow(() =>
			scope.metric.counter({
				name: "queries_total",
				help: "help",
				labelNames: [],
				registry: "local",
			}),
		);
	});

	t.test(
		"resolves once the holding scope is released",
		async (t: TestContext) => {
			const introspection = new TestIntrospection();

			const scope = introspection.scope("x");
			collectedGauge(scope)("queued_total", 1);
			t.assert.match(await introspection.render(), /^x_queued_total 1$/m);

			scope.release();

			// collects through the closure of the new scope, not the released one
			collectedGauge(introspection.scope("x"))("queued_total", 2);
			t.assert.match(await introspection.render(), /^x_queued_total 2$/m);
		},
	);
});

test("registration stays out of the default registry", (t: TestContext) => {
	const introspection = new TestIntrospection();

	const scope = introspection.scope("confined");
	counter(scope)("queries_total");

	// `prom-client` registers into its default registry when constructed without `registers`, which is never served and which `release` cannot reach
	t.assert.deepStrictEqual(
		defaultRegistry.getSingleMetric("confined_queries_total"),
		undefined,
	);

	scope.release();
});
