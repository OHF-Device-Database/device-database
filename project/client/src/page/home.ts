import { Schema } from "effect";
import { LitElement, css, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { idempotentOperation } from "../api/base";

import "../element/sized-image";
import "../element/stat";

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

	private _statsTask = (() => {
		const operation = idempotentOperation(
			"getStatsStagingSnapshot",
			"/api/v1/stats/staging/snapshot",
			"get",
			{}
		);
		const expected = Schema.Struct({
			code: Schema.Literal(200),
			body: Schema.Struct({
				submissions: Schema.Number,
				devices: Schema.Number,
				devicePermutations: Schema.Number,
				entities: Schema.Number,
				integrations: Schema.Number,
				subjects: Schema.Number,
			}),
		});

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

		#stats {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
			grid-auto-rows: min-height;
			gap: 5px;
		}

		#stats > * {
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
				<div id="stats">
					${this._statsTask.render({
						pending: () => nothing,
						complete: (response) =>
							html`<div id="stats">
								<element-stat>
									<span slot="title">submissions</span
									><span slot="value"
										>${response.body.submissions}</span
									></element-stat
								>
								<element-stat>
									<span slot="title">integrations</span
									><span slot="value"
										>${response.body.integrations}</span
									></element-stat
								>
								<element-stat>
									<span slot="title">instances</span
									><span slot="value"
										>${response.body.subjects}</span
									></element-stat
								>
								<element-stat>
									<span slot="title">devices</span
									><span slot="value"
										>${response.body.devices}</span
									></element-stat
								>
								<element-stat>
									<span slot="title">device permutations</span
									><span slot="value"
										>${response.body.devicePermutations}</span
									></element-stat
								>
								<element-stat>
									<span slot="title">entities</span
									><span slot="value"
										>${response.body.entities}</span
									></element-stat
								>
							</div>`,
						error: (e) => html`<p>stats status: ${e}</p>`,
					})}
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
