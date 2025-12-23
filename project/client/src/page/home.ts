import { Schema } from "effect";
import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

import "../element/sized-image";

import ImageOpenHomeFoundation from "inline:open-home-foundation.svg";
import { MixinIsomorph } from "../mixin/isomorph";

@customElement("element-page-home")
export class PageHome extends MixinIsomorph(LitElement) {
	private _healthTask = (() => {
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
			h1 {
				margin-top: 6px;
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

		#tiles {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
			grid-auto-rows: min-height;
			gap: 5px;
		}

		.tile {
			display: flex;
			flex-direction: column;
			font-weight: 300;
			border-radius: 4px;
			justify-content: center;
			align-items: center;
			gap: 4px;
			background-color: #e7e7e7;
			text-decoration: none;
			color: black;
			padding: 12px 12px 12px 12px;

			> :first-child {
				font-size: 32px;
			}

			&:hover {
				background-color: #d7d7d7;
			}
		}
	`;

	render() {
		return html`<main>
			<div id="top">
				<div id="heading">
					<h1>device database</h1>
				</div>
				<div id="disclaimer">
					<p>congratulations, you just stumbled upon the device database!</p>
					<p>
						check out the
						<a
							href="https://github.com/OHF-Device-Database/backlog-items/wiki/Open-Home-Foundation-%E2%80%90-Device-Database"
							>wiki</a
						>
						to see what this is all about
					</p>
				</div>
				<div id="tiles">
					<a
						class="tile"
						href="https://openhomefoundation.grafana.net/public-dashboards/1cb22c82e90c4f64afb366c6125a8489"
						target="_blank"
						rel="noopener noreferrer"
					>
						<div>📊</div>
						<div>statistics</div>
					</a>
					<a class="tile" href="/system/database/snapshot.db">
						<div>⬇️</div>
						<div>download database</div>
					</a>
				</div>
			</div>

			<div id="bottom">
				<img id="image-foundation" src=${ImageOpenHomeFoundation} />
				${this._healthTask.render({
					pending: () => html`<p>status: ...</p>`,
					complete: (response) => html` <p>status: ${response.body}</p> `,
					error: (e) => html`<p>status: ${e}</p>`,
				})}
			</div>
		</main>`;
	}
}
