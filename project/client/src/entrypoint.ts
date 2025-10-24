import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";
import { hydrate } from "@lit-labs/ssr-client";
import { ContextProvider } from "@lit/context";

import { bindFetch, type Io } from "./api/base";
import { csrIo } from "./csr";
import { ContextFetch } from "./context/fetch";
import "./page/home";
import type { Resolve } from "./context/resolve";
import { ContextResolve } from "./context/resolve";
import { ContextResolved, type Resolved } from "./context/resolved";

@customElement("element-entrypoint")
export class Entrypoint extends LitElement {
	render() {
		return html`<element-page-home></element-page-home>`;
	}
}

const host: HTMLElement = SSR
	? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- injected during SSR
		((globalThis as any).litServerRoot as HTMLElement)
	: document.body;

const provider = {
	fetch: new ContextProvider(host, {
		context: ContextFetch,
		initialValue: bindFetch(csrIo),
	}),
	resolve: new ContextProvider(host, {
		context: ContextResolve,
	}),
	resolved: new ContextProvider(host, {
		context: ContextResolved,
	}),
} as const;

type EntrypointTemplateContext = {
	io: Io;
	resolve?: Resolve;
	resolved?: Resolved;
};

export const entrypointTemplate = ({
	io,
	resolve,
	resolved,
}: EntrypointTemplateContext) => {
	provider.fetch.setValue(bindFetch(io));
	if (typeof resolve !== "undefined") {
		provider.resolve.setValue(resolve);
	}
	if (typeof RESOLVED !== "undefined") {
		provider.resolved.setValue(RESOLVED);
	} else if (typeof resolved !== "undefined") {
		provider.resolved.setValue(resolved);
	}

	return html`<element-entrypoint></element-entrypoint>`;
};

export const csr = () => {
	hydrate(entrypointTemplate({ io: csrIo }), window.document.body);
};
