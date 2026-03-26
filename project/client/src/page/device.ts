import { Schema } from "effect";
import { LitElement, css, html, nothing } from "lit";
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

	static styles = css`
		main {
			padding: 16px;
			box-sizing: border-box;
		}

		@media (min-width: 640px) {
			main {
				padding: 32px 24px;
			}
		}

		#device-header {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
			max-width: 640px;
			margin: 0 auto;
		}

		#device-image {
			width: 96px;
			height: 96px;
			border-radius: 12px;
			background-color: #e0e0e0;
			flex-shrink: 0;
		}

		#device-info {
			display: flex;
			flex-direction: column;
			gap: 4px;
			min-width: 0;
			width: 100%;
		}

		.integration {
			font-size: 0.95em;
			font-weight: 300;
		}

		.manufacturer {
			font-size: 2em;
		}

		.model {
			font-size: 1.5em;
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.model-id {
			font-family: monospace;
			font-size: 1em;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	`;

	render() {
		return html`<main>
			${this._deviceTask.render({
				pending: () => html`<p>...</p>`,
				complete: (response) => {
					if (typeof response === "undefined") {
						return html`<p>no device identifier provided</p>`;
					}

					if (response.code !== 200) {
						return html`<p>${response.body}</p>`;
					}

					const { integration, manufacturer, model, model_id } = response.body;

					return html`<div id="device-header">
						<div id="device-image"></div>
						<div id="device-info">
							<div class="integration">${integration}</div>
							<div class="manufacturer">${manufacturer}</div>
							${model ? html`<div class="model">${model}</div>` : nothing}
							${model && model_id
								? html`<code class="model-id">${model_id}</code>`
								: nothing}
						</div>
					</div>`;
				},
				error: (e) => html`<p>error: ${e}</p>`,
			})}
		</main>`;
	}
}
