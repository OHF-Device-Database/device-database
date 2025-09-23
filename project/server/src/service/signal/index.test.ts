import { mock } from "node:test";

import { test } from "tap";

import { uuid } from "../../type/codec/uuid";
import { Signal } from ".";

import type { Event, ISignalProvider } from "./base";

test("send", async (t) => {
	class Provider implements ISignalProvider {
		constructor(private isSupported: boolean) {}

		async send(event: Event): Promise<void> {}
		supported(event: Event): boolean {
			return this.isSupported;
		}
	}

	const p0 = new Provider(true);
	const p1 = new Provider(false);

	const m0 = mock.method(p0, "send", async () => {});
	const m1 = mock.method(p1, "send", async () => {});

	const signal = new Signal([p0, p1]);

	await signal.send({
		kind: "submission",
		context: {
			id: uuid(),
			contact: "foo@bar.com",
			version: 0,
		},
	});

	t.equal(m0.mock.callCount(), 1);
	t.equal(m1.mock.callCount(), 0);
});
