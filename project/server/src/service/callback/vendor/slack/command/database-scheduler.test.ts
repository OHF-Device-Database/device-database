import { type TestContext, test } from "node:test";

import { Scheduler } from "../../../../scheduler";
import { Suspendable } from "../../../../suspendable";
import { parseCommandTextDatabaseScheduler } from "./database-scheduler";
import {
	build,
	ctx,
	errors,
	posted,
	stubChannelId,
	stubMessageTs,
	stubSlackApi,
	texts,
} from "./utility";

import type {
	SchedulerActStatus,
	SchedulerPlan,
	SchedulerPlanStrategy,
} from "../../../../scheduler";
import type { ISchedulerCoordinator } from "../../../../scheduler/coordinator";

class Unit {
	static readonly id = Symbol("TestUnit");
	static readonly prerequisites = [];
	static readonly schedule = { minute: "0", hour: "0" } as const;

	async run(): Promise<void> {}
}

/** stands in for the coordinator the composition roots provide, backed by an actual scheduler */
class StubSchedulerCoordinator
	extends Suspendable
	implements ISchedulerCoordinator
{
	private scheduler = new Scheduler([new Unit()]);

	override drain(): Promise<void> {
		return Promise.resolve();
	}

	scheduleable(): Iterable<symbol> {
		return this.scheduler.scheduleable();
	}

	plan(id: symbol): SchedulerPlan {
		return this.scheduler.plan(id);
	}

	run(plan: SchedulerPlanStrategy): AsyncIterable<SchedulerActStatus> {
		return this.scheduler.act(plan);
	}
}

/** stands in for a coordinator whose units are all undescribed, so none can be named */
class StubUndescribedSchedulerCoordinator extends StubSchedulerCoordinator {
	override scheduleable(): Iterable<symbol> {
		return [Symbol()];
	}
}

test("/database-scheduler", async (t: TestContext) => {
	await t.test("parses an action", (t: TestContext) => {
		t.assert.deepStrictEqual(parseCommandTextDatabaseScheduler("suspend"), {
			kind: "parsed",
			inner: { action: "suspend" },
		});
		t.assert.deepStrictEqual(parseCommandTextDatabaseScheduler("resume"), {
			kind: "parsed",
			inner: { action: "resume" },
		});
		t.assert.deepStrictEqual(
			parseCommandTextDatabaseScheduler("run DeriveDevice"),
			{
				kind: "parsed",
				inner: { action: "run", scheduleable: "DeriveDevice" },
			},
		);
	});

	await t.test("rejects an unknown action", (t: TestContext) => {
		t.assert.deepStrictEqual(
			errors(parseCommandTextDatabaseScheduler("halt")),
			["unknown action (known: suspend, resume, run)"],
		);
	});

	await t.test("rejects a run without a name", (t: TestContext) => {
		t.assert.deepStrictEqual(errors(parseCommandTextDatabaseScheduler("run")), [
			"missing parameter, scheduleable name expected",
		]);
	});

	await t.test("rejects excess parameters", (t: TestContext) => {
		t.assert.deepStrictEqual(
			errors(parseCommandTextDatabaseScheduler("run DeriveDevice now")),
			["excess parameter, only two expected"],
		);
		t.assert.deepStrictEqual(
			errors(parseCommandTextDatabaseScheduler("suspend DeriveDevice")),
			["excess parameter, only one expected"],
		);
		t.assert.deepStrictEqual(
			errors(parseCommandTextDatabaseScheduler("resume DeriveDevice")),
			["excess parameter, only one expected"],
		);
	});

	await t.test("reports unavailable scheduler", async (t: TestContext) => {
		const handled = await build().handle("/database-scheduler", "resume", ctx);

		t.assert.deepStrictEqual(texts(handled), ["scheduler not available 😔"]);
	});

	await t.test("reports a parse error", async (t: TestContext) => {
		const handled = await build({
			scheduler: new StubSchedulerCoordinator(),
		}).handle("/database-scheduler", "halt", ctx);

		t.assert.deepStrictEqual(texts(handled), [
			"unknown action (known: suspend, resume, run)",
		]);
	});

	await t.test(
		"lists scheduleable units for an unknown name",
		async (t: TestContext) => {
			const handled = await build({
				scheduler: new StubSchedulerCoordinator(),
			}).handle("/database-scheduler", "run Nope", ctx);

			t.assert.match(
				texts(handled)[0] ?? "",
				/^unknown scheduleable \(known: `\w+`(?:, `\w+`)*\)$/,
			);
		},
	);

	await t.test(
		"reports an unknown name when no units have descriptions",
		async (t: TestContext) => {
			const handled = await build({
				scheduler: new StubUndescribedSchedulerCoordinator(),
			}).handle("/database-scheduler", "run Nope", ctx);

			t.assert.deepStrictEqual(texts(handled), [
				"unknown scheduleable (no known scheduleable units)",
			]);
		},
	);

	await t.test(
		"reports run statuses as they come in",
		async (t: TestContext) => {
			const { calls, reached } = stubSlackApi(
				t,
				(call) =>
					call.path === "chat.postMessage" &&
					(texts(posted(call))[0] ?? "").startsWith("ran "),
			);

			const handled = await build({
				scheduler: new StubSchedulerCoordinator(),
			}).handle("/database-scheduler", "run TestUnit", ctx);

			t.assert.deepStrictEqual(texts(handled), [
				`running *\`TestUnit\`*, will report over in <#${stubChannelId}> as it goes ⌛️`,
			]);

			// the run is handed off out of band
			await reached;

			const messages = calls.filter((call) => call.path === "chat.postMessage");

			t.assert.deepStrictEqual(
				messages.map((message) =>
					// the elapsed time isn't reproducible
					(texts(posted(message))[0] ?? "").replace(/\n\S+s ✅/, "\n…s ✅"),
				),
				[
					"running *`TestUnit`* ▶️",
					"*`TestUnit`*\nrunning ⌛️",
					"*`TestUnit`*\n…s ✅",
					"ran *`TestUnit`* ⏹️",
				],
			);

			// every status replies within the thread the first message opened
			t.assert.deepStrictEqual(
				messages.map((message) => message.body.thread_ts),
				[undefined, stubMessageTs, stubMessageTs, stubMessageTs],
			);
		},
	);

	await t.test("resumes without suspending first", async (t: TestContext) => {
		const handled = await build({
			scheduler: new StubSchedulerCoordinator(),
		}).handle("/database-scheduler", "resume", ctx);

		t.assert.deepStrictEqual(texts(handled), ["not previously suspended"]);
	});
});
