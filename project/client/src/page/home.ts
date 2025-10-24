import { Schema } from "effect";
import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

import "../element/sized-image";

import ImageOpenHomeFoundation from "inline:open-home-foundation.svg";
import ImageDeviceDatabase from "sized:logo.png" with { resize: "w=64" };
import { MixinIsomorph } from "../mixin/isomorph";

@customElement("element-page-home")
export class PageHome extends MixinIsomorph(LitElement) {
	private _task = (() => {
		const operation = idempotentOperation(
			"getHealth",
			"/api/v1/health",
			"get",
			{}
		);
		const expected = Schema.Union(
			Schema.Struct({
				code: Schema.Literal(200),
				body: Schema.Literal("ok"),
			}),
			Schema.Struct({
				code: Schema.Literal(500),
				body: Schema.Literal("not ok"),
			})
		);

		return this.task($X_SYN_LOCATION_TOKEN, {
			taskFn: async (_, context) => {
				return await context.fetch(operation, expected);
			},
			argsFn: () => [],
		});
	})();

	static styles = css`
		main {
			height: 100%;
		}

		#container {
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			gap: 18px;
			padding: 1em 1.2em 1em 1.2em;
			height: 100%;
			box-sizing: border-box;
		}

		#image-foundation {
			max-width: 192px;
		}

		#heading {
			display: flex;
			align-items: center;
			gap: 16px;
		}

		#image-device-database::part(img) {
			border-radius: 8px;
		}
	`;

	render() {
		return html`<main>
			<div id="container">
				<div>
					<div id="heading">
						<element-sized-image
							id="image-device-database"
							.sized=${ImageDeviceDatabase}
						></element-sized-image>
						<h1>device database</h1>
					</div>
					<div>hello world</div>

					${this._task.render({
						pending: () => html`<p>loading status...</p>`,
						complete: (response) => html` <p>status ${response.body}</p> `,
						error: (e) => html`<p>status error: ${e}</p>`,
					})}
				</div>

				<div>
					<img id="image-foundation" src=${ImageOpenHomeFoundation} />
				</div>
			</div>
		</main>`;
	}
}
