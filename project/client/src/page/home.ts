import { Schema } from "effect";
import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

import "../element/sized-image";

import ImageOpenHomeFoundation from "inline:open-home-foundation.svg";
import ImageDeviceDatabase from "sized:logo.png" with { resize: "w=92" };
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
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			gap: 18px;
			padding: 1em 1.2em 1em 1.2em;
			height: 100%;
			box-sizing: border-box;
		}

		#top {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		#bottom {
			display: flex;
			justify-content: space-between;
			align-items: flex-end;
			flex-wrap: wrap;
			gap: 8px;

			p {
				margin: 0;
			}
		}

		#image-foundation {
			max-width: 192px;
		}

		#heading {
			display: flex;
			align-items: center;
			gap: 12px 18px;
			flex-wrap: wrap;

			h1 {
				margin: 0;
			}
		}

		#disclaimer {
			p:not(:last-child) {
				margin: 0;
			}
		}

		#image-device-database::part(img) {
			width: 64px;
			height: 64px;
			border-radius: 8px;
		}
	`;

	render() {
		return html`<main>
			<div id="top">
				<div id="heading">
					<element-sized-image
						id="image-device-database"
						.sized=${ImageDeviceDatabase}
					></element-sized-image>
					<h1>device database</h1>
				</div>
				<div id="disclaimer">
					<p>congratulations, you just stumbled upon the device database!</p>
					<p>
						there's not a lot to see here right now, but we'll put out an
						announcement once that changes
					</p>
				</div>
			</div>

			<div id="bottom">
				<img id="image-foundation" src=${ImageOpenHomeFoundation} />
				${this._task.render({
					pending: () => html`<p>status: ...</p>`,
					complete: (response) => html` <p>status: ${response.body}</p> `,
					error: (e) => html`<p>status: ${e}</p>`,
				})}
			</div>
		</main>`;
	}
}
