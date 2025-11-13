import { html, css, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("element-stat")
export class ElementStat extends LitElement {
	static styles = css`
		#box {
			display: flex;
			flex-direction: column;
			gap: 16px;
			background-color: #e7e7e7;
			border-radius: 4px;
			align-content: flex-end;
			padding: 12px 12px 12px 12px;
		}

		slot[name="title"] {
			color: #808080;
			text-align: right;
		}

		slot[name="value"] {
			text-align: right;
			font-weight: 400;
			font-size: 32px;
		}
	`;

	render() {
		return html`<div id="box">
			<slot name="title"></slot>
			<slot name="value"></slot>
		</div>`;
	}
}
