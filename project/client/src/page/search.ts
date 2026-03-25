import { Schema } from "effect";
import { LitElement, css, html, isServer, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import type { Router } from "../vendor/@lit-labs/router/router";

import { idempotentOperation } from "../api/base";
import { MixinIsomorph } from "../mixin/isomorph";
import { ContextLocation, type Location } from "../context/location";

import "@lit-labs/virtualizer";
import { ContextRouter } from "../context/router";

const Device = Schema.Struct({
	id: Schema.String,
	integration: Schema.String,
	manufacturer: Schema.String,
	model: Schema.optional(Schema.String),
	model_id: Schema.optional(Schema.String),
	count: Schema.Number,
});
type Device = typeof Device.Type;

@customElement("element-page-search")
export class PageSearch extends MixinIsomorph(LitElement) {
	@property({ type: String, attribute: true })
	term?: string;

	@state()
	hydrated = false;

	@consume({ context: ContextLocation, subscribe: true })
	private location?: Location;

	@consume({ context: ContextRouter, subscribe: true })
	private router?: Router;

	private _devicesTask = (() => {
		return this.task($X_SYN_LOCATION_TOKEN, {
			taskFn: async ([term], context) => {
				if (typeof term !== "string" || term.trim().length === 0) {
					return undefined;
				}

				const operation = idempotentOperation(
					"getDerivedDevices",
					"/api/unstable/derived/devices",
					"get",
					{
						query: { term },
					}
				);

				const expected = Schema.Union(
					Schema.Struct({
						code: Schema.Literal(200),
						body: Schema.Array(Device),
					}),
					Schema.Struct({
						code: Schema.Literal(404),
						body: Schema.Literal("not found"),
					})
				);

				return await context.fetch(operation, expected);
			},
			argsFn: () => [this.location?.searchParams.get("term")],
		});
	})();

	static styles = css`
		h1 {
			display: inline-block;
			margin: 0;
		}

		#entrypoint {
			max-width: 100%;
			min-height: 100%;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			gap: 12px 0px;
		}

		// flex container is necessary so that margin of first child is applied
		// otherwise, a layout shift occurrs
		#unhydrated {
			display: flex;
			flex-direction: column;
			gap: 0;
		}

		.device {
			padding-top: 8px;
			padding-bottom: 8px;
		}

		.integration {
			font-weight: 300;
		}

		.model: {
			font-weight: 700;
		}
	`;

	private entrypointFormSubmit(e: SubmitEvent) {
		if (typeof this.router === "undefined") {
			return;
		}

		e.preventDefault();

		const data = new FormData(e.target as HTMLFormElement);

		const term = data.get("term");
		if (typeof term !== "string" || term.trim().length === 0) {
			return;
		}

		const url = new URL(window.location.href);
		url.searchParams.set("term", term);

		// router `.goto` does not support query parameters → push to history, then navigate
		window.history.pushState({}, "", url.toString());
		void this.router.goto(this.router.link());
	}

	private entrypoint() {
		return html`<main id="entrypoint">
			<h1>device database</h1>

			<form method="get" @submit=${this.entrypointFormSubmit}>
				<input type="search" placeholder="term" name="term" />
				<input type="submit" value="search" />
			</form>
		</main>`;
	}

	static listItemDevice(device: Device) {
		const rendered = html`<div class="device">
			<div class="integration">${device.integration}</div>
			<div class="model">${device.model}</div>
			<div class="model-id">${device.model_id}</div>
			<div class="count">${device.count}</div>
		</div>`;

		const destination = `/device/${device.id}`;

		return html`<a href=${destination}>${rendered}</a>`;
	}

	protected firstUpdated(): void {
		this.hydrated = true;
	}

	private filtering(devices: readonly Device[]) {
		if (
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- faulty typing
			isServer ||
			!this.hydrated
		) {
			const max = 5;
			const sliced = devices.length > max;
			const mapped = devices.slice(0, max).map(PageSearch.listItemDevice);
			return html`<div>
				<div id="unhydrated">${mapped}</div>
				${sliced ? html`<p>...</p>` : nothing}
			</div>`;
		}

		return html`<lit-virtualizer
			.items=${devices}
			.renderItem=${PageSearch.listItemDevice}
		></lit-virtualizer>`;
	}

	render() {
		return this._devicesTask.render({
			pending: () => html`<p>...</p>`,
			complete: (response) =>
				typeof response !== "undefined"
					? response.code === 200
						? html`<main>
								<h2>results</h2>
								${this.filtering(response.body)}
							</main>`
						: html`<p>${response.body}</p>`
					: this.entrypoint(),
			error: (e) => html`<p>error: ${e}</p>`,
		});
	}
}
