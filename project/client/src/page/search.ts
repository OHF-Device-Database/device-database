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

		#results-layout {
			display: flex;
			flex-direction: row;
			width: 100%;
			min-height: 100%;
		}

		aside {
			width: 220px;
			flex-shrink: 0;
			position: sticky;
			top: 0;
			height: 100vh;
			overflow-y: auto;
			padding: 16px;
			border-right: 1px solid #e0e0e0;
			display: flex;
			flex-direction: column;
			gap: 16px;
			box-sizing: border-box;
		}

		aside form {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		aside form noscript {
			margin-top: auto;
		}

		aside form noscript input[type="submit"] {
			width: 100%;
			box-sizing: border-box;
		}

		aside form input[type="search"] {
			width: 100%;
			box-sizing: border-box;
		}

		aside form fieldset {
			border: 1px solid #e0e0e0;
			border-radius: 4px;
			padding: 8px 10px;
			margin: 0;
		}

		aside form fieldset legend {
			font-size: 0.8em;
			font-weight: 500;
			letter-spacing: 0.05em;
			padding: 0 4px;
		}

		aside details {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 8px;
			min-height: 0;
		}

		aside details summary {
			flex-shrink: 0;
			list-style: none;
			cursor: pointer;
			user-select: none;
			font-size: 0.85em;
			font-weight: 500;
			letter-spacing: 0.05em;
			padding: 4px 0;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		aside details summary::after {
			content: "▸";
		}

		aside details:not([open]) summary::after {
			rotate: 90deg;
		}

		/* otherwise spacing between form and details bleeds into collapsed layout */
		aside details:not([open]) {
			gap: 0;
		}

		.integration-filter {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 3px 0;
			cursor: pointer;
			font-size: 0.9em;
		}

		#results-layout main {
			flex: 1;
			padding: 16px;
			overflow: auto;
			min-width: 0;
		}

		/* flex container is necessary so that margin of first child is applied
		   otherwise, a layout shift occurrs */
		#unhydrated {
			display: flex;
			flex-direction: column;
			gap: 0;
		}

		a:has(.device) {
			display: block;
			width: 100%;
			padding-bottom: 8px;
			text-decoration: none;
		}

		.device {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 12px;
			width: 100%;
			padding: 8px;
			box-sizing: border-box;
			background-color: #f5f5f5;
			border-radius: 8px;
			color: black;
			transition: background-color 0.15s ease;
		}

		.device:hover {
			background-color: #e8e8e8;
		}

		.device-image {
			width: 64px;
			height: 64px;
			border-radius: 8px;
			background-color: #e0e0e0;
			flex-shrink: 0;
		}

		.device-info {
			display: flex;
			gap: 4px;
			flex-direction: column;
			flex: 1;
			min-width: 0;
		}

		.device-info > div {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.model {
			font-weight: 700;
		}

		.model-id {
			font-family: monospace;
		}

		.integration {
			font-size: 0.8em;
			font-weight: 300;
		}

		.manufacturer {
			font-size: 1.2em;
		}

		.count {
			margin-left: auto;
			font-variant-numeric: tabular-nums;
			text-decoration: none;
			background-color: black;
			color: white;
			border-radius: 999px;
			padding: 2px 8px;
			font-size: 0.8em;
			font-weight: 500;
		}

		@media (max-width: 768px) {
			#results-layout {
				flex-direction: column;
			}

			aside {
				width: 100%;
				height: auto;
				border-right: none;
				border-bottom: 1px solid #e0e0e0;
				background-color: white;
				z-index: 10;
			}
		}

		@media (min-width: 768px) {
			aside:has(details:not([open])) {
				width: 28px;
				overflow: hidden;
				padding: 8px 4px;
			}

			aside:has(details:not([open])) details {
				align-items: center;
				justify-content: center;
			}

			aside:has(details:not([open])) details summary {
				/* allows expanding horizontally, so whole height is click area */
				writing-mode: vertical-rl;
				transform: rotate(180deg);
				flex: 1;
				padding: 0;
				justify-content: center;
			}

			aside details summary::after {
				display: none;
			}
		}
	`;

	private _navigate(term: string, integrations?: Set<string>) {
		if (typeof this.router === "undefined") {
			return;
		}

		const url = new URL(window.location.href);

		url.searchParams.set("term", term);

		url.searchParams.delete("integration");
		for (const integration of integrations ?? []) {
			url.searchParams.append("integration", integration);
		}

		// router `.goto` does not support query parameters → push to history, then navigate
		window.history.pushState({}, "", url.toString());
		void this.router.goto(this.router.link());
	}

	private formSubmit(e: SubmitEvent) {
		e.preventDefault();

		const data = new FormData(e.target as HTMLFormElement);
		const term = data.get("term");
		if (typeof term !== "string" || term.trim().length === 0) {
			return;
		}

		this._navigate(term);
	}

	private onIntegrationToggle(integration: string, checked: boolean) {
		const next = new Set(
			this.location?.searchParams.getAll("integration") ?? []
		);
		if (checked) {
			next.add(integration);
		} else {
			next.delete(integration);
		}

		this._navigate(this.location?.searchParams.get("term") ?? "", next);
	}

	private entrypoint() {
		return html`<main id="entrypoint">
			<h1>device database</h1>

			<form method="get" @submit=${this.formSubmit}>
				<input type="search" placeholder="term" name="term" />
				<input type="submit" value="search" />
			</form>
		</main>`;
	}

	private sidebar(devices: readonly Device[]) {
		const term = this.location?.searchParams.get("term") ?? "";
		const integrations = new Set(devices.map((d) => d.integration));

		const selectedIntegrations = new Set(
			this.location?.searchParams.getAll("integration") ?? []
		);

		const checkboxes = [...integrations].toSorted().map((integration) => {
			const isChecked = selectedIntegrations.has(integration);

			const onChange = (e: Event) => {
				const input = e.target as HTMLInputElement;
				this.onIntegrationToggle(input.value, input.checked);
			};

			return html`<label class="integration-filter">
				<input
					type="checkbox"
					name="integration"
					.value=${integration}
					.checked=${isChecked || nothing}
					@change=${onChange}
				/>
				${integration}
			</label>`;
		});

		return html`<aside>
			<details open>
				<summary>filters</summary>
				<form method="get" @submit=${this.formSubmit}>
					<input type="search" name="term" .value=${term} placeholder="term" />

					${integrations.size > 0
						? html`<fieldset>
								<legend>integrations</legend>
								${checkboxes}
							</fieldset>`
						: nothing}

					<noscript>
						<input type="submit" value="submit" />
					</noscript>
				</form>
			</details>
		</aside>`;
	}

	static listItemDevice(device: Device) {
		const modelId = device.model_id
			? html`<code class="model-id">${device.model_id}</code>`
			: nothing;

		const modelLine = device.model
			? html`<span class="model">${device.model}</span>${device.model_id
						? html` (${modelId})`
						: nothing}`
			: modelId;

		const rendered = html`<div class="device">
			<div class="device-image"></div>
			<div class="device-info">
				<div class="integration">${device.integration}</div>
				<div class="manufacturer">${device.manufacturer}</div>
				<div>${modelLine}</div>
			</div>
			<div class="count">${device.count}</div>
		</div>`;

		return html`<a href=${`/device/${device.id}`}>${rendered}</a>`;
	}

	protected firstUpdated(): void {
		this.hydrated = true;
	}

	private filterDevices(devices: readonly Device[]): readonly Device[] {
		const selected = new Set(
			this.location?.searchParams.getAll("integration") ?? []
		);
		// empty set means nothing is checked → no filter, show everything
		const filtered =
			selected.size === 0
				? devices
				: devices.filter((d) => selected.has(d.integration));
		return [...filtered].sort((a, b) => b.count - a.count);
	}

	private filtering(devices: readonly Device[]) {
		if (
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- faulty typing
			isServer ||
			!this.hydrated
		) {
			const max = 10;
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
			pending: () =>
				html`<div id="results-layout">
					${this.sidebar([])}
					<main><p>...</p></main>
				</div>`,
			complete: (response) =>
				typeof response !== "undefined"
					? response.code === 200
						? html`<div id="results-layout">
								${this.sidebar(response.body)}
								<main>
									${this.filtering(this.filterDevices(response.body))}
								</main>
							</div>`
						: html`<p>${response.body}</p>`
					: this.entrypoint(),
			error: (e) => html`<p>error: ${e}</p>`,
		});
	}
}
