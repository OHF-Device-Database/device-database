import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

type SizedImage = {
	src: string;
	width: number;
	height: number;
};

@customElement("element-sized-image")
export class ElementSizedImage extends LitElement {
	@property({ type: Object })
	sized?: SizedImage;
	@property({ type: String })
	alt?: string;

	render() {
		return html`<img
			part="img"
			src=${this.sized?.src}
			width=${this.sized?.width}
			height=${this.sized?.height}
			alt=${this.alt}
		/>`;
	}
}
