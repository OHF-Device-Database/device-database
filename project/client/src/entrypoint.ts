import { css, html, LitElement } from "lit";
import { Task } from "@lit/task";
import { customElement, property } from "lit/decorators.js";
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";
import { hydrate } from "@lit-labs/ssr-client";
import { createContext, provide } from "@lit/context";

import "./element/sized-image";

import ImageOpenHomeFoundation from "inline:open-home-foundation.svg";
import ImageDeviceDatabase from "sized:logo.png" with { resize: "w=64" };

import type { Fetch } from "./api/base";
import { bindFetch, idempotentOperation, type Io } from "./api/base";
import { csrIo } from "./csr";
import { Schema } from "effect/index";

export const ContextFetch = createContext<Fetch>(Symbol("fetch"));

@customElement("element-entrypoint")
export class Entrypoint extends LitElement {
	@provide({ context: ContextFetch })
	@property({ attribute: false })
	fetch: Fetch = bindFetch(csrIo);

	private _task = new Task(this, {
		task: async () => {
			const operation = idempotentOperation(
				"getHealth",
				"/api/v1/health",
				"get",
				{}
			);
			const expected = Schema.Union(
				Schema.Struct({ code: Schema.Literal(200), body: Schema.Literal("ok") })
			);

			return await this.fetch(operation, expected);
		},
		args: () => [],
	});

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

export const entrypointTemplate = (io?: Io) =>
	html`<element-entrypoint
		.fetch=${typeof io !== "undefined" ? bindFetch(io) : undefined}
	></element-entrypoint>`;

export const csr = () => {
	hydrate(entrypointTemplate, window.document.body);
};
