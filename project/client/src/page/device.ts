import { Schema } from "effect";
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

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
					"getDerivedDevice",
					"/api/unstable/derived/devices/{id}",
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
							manufacturer: Schema.String,
							model: Schema.optional(Schema.String),
							model_id: Schema.optional(Schema.String),
							count: Schema.Number,
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

	private _reload() {
		void this._deviceTask.run();
	}

	render() {
		return html`<main>
			<pre>id: ${this.deviceId}</pre>
			<button @click=${this._reload}>reload</button>

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
