import { Schema } from "effect";
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

import "@home-assistant/webawesome/dist/components/button/button.js";

import { MixinIsomorph } from "../mixin/isomorph";

@customElement("element-page-device")
export class PageDevice extends MixinIsomorph(LitElement) {
	@property({ type: String, attribute: "device-id" })
	deviceId?: string;

	private _deviceTask = (() => {
		return this.task($X_SYN_LOCATION_TOKEN, {
			taskFn: async ([id], context) => {
				if (typeof id === "undefined") {
					return undefined;
				}

				const operation = idempotentOperation(
					"getDevice",
					"/api/unstable/devices/{id}",
					"get",
					{
						path: { id },
					}
				);

				const expected = Schema.Union(
					Schema.Struct({
						code: Schema.Literal(200),
						body: Schema.Struct({
							integration: Schema.String,
							manufacturer: Schema.optional(Schema.String),
							model: Schema.optional(Schema.String),
							model_id: Schema.optional(Schema.String),
						}),
					}),
					Schema.Struct({
						code: Schema.Literal(404),
						body: Schema.Literal("not found"),
					})
				);

				return await context.fetch(operation, expected);
			},
			argsFn: () => [this.deviceId],
		});
	})();

	static styles = css`
		wa-button.custom-button::part(base) {
			border-radius: 6px;
			padding: 6px 8px 6px 8px;
			background: black;
			color: white;
		}
	`;

	private _reload() {
		void this._deviceTask.run();
	}

	render() {
		return html`<main>
			<pre>id: ${this.deviceId}</pre>
			<wa-button class="custom-button" @click=${this._reload}>reload</wa-button>

			${this._deviceTask.render({
				pending: () => html`<p>...</p>`,
				complete: (response) =>
					typeof response !== "undefined"
						? response.code === 200
							? html`<pre>${JSON.stringify(response.body)}</pre>`
							: html`<p>${response.body}</p>`
						: html`<p>no device identifier provided</p>`,
				error: (e) => html`<p>error: ${e}</p>`,
			})}
		</main>`;
	}
}
