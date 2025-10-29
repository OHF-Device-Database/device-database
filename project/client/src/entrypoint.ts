// https://lit.dev/docs/ssr/client-usage/#loading-@lit-labsssr-clientlit-element-hydrate-support.js
// if not imported before _anything_ else, stuff is rendered twice during hydration 🫣
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";

import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { hydrate } from "@lit-labs/ssr-client";
import { consume, ContextProvider } from "@lit/context";

import { bindFetch, type Io } from "./api/base";
import { csrIo } from "./csr";
import { ContextFetch } from "./context/fetch";
import type { SsrResolve } from "./context/ssr/resolve";
import { ContextSsrResolve } from "./context/ssr/resolve";
import { ContextSsrResolved, type SsrResolved } from "./context/ssr/resolved";
import { Router } from "./vendor/@lit-labs/router/router";
import {
	RouterPathNotFoundError,
	type RouteConfig,
} from "./vendor/@lit-labs/router/routes";
import { ContextSsrLocation, type SsrLocation } from "./context/ssr/location";

import "./page/home";

const routes = [
	{
		path: "/",
		render: () => html`<element-page-home></element-page-home>`,
	},
] as const satisfies RouteConfig[];

@customElement("element-entrypoint")
export class Entrypoint extends LitElement {
	private _router: Router | undefined;

	@consume({ context: ContextSsrLocation })
	private ssrLocation?: SsrLocation | undefined;

	override connectedCallback(): void {
		super.connectedCallback();

		if (typeof this._router !== "undefined") {
			return;
		}

		const location = {
			origin:
				this.ssrLocation?.origin ??
				(window.location.origin ||
					window.location.protocol + "//" + window.location.host),
			pathname: this.ssrLocation?.pathname ?? window.location.pathname,
			status: this.ssrLocation?.status,
		};

		const router = new Router(this, routes, {
			origin: location.origin,
			status: location.status,
		});
		this._router = router;

		router.goto(location.pathname).catch((e: unknown) => {
			if (e instanceof RouterPathNotFoundError) {
				location.status?.(404);
			}
		});
	}

	render() {
		return this._router?.outlet();
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
		context: ContextSsrResolve,
	}),
	resolved: new ContextProvider(host, {
		context: ContextSsrResolved,
	}),
	location: new ContextProvider(host, {
		context: ContextSsrLocation,
	}),
} as const;

type EntrypointTemplateContext = {
	io: Io;
	resolve?: SsrResolve;
	resolved?: SsrResolved;
	location?: SsrLocation;
};

export const entrypointTemplate = ({
	io,
	resolve,
	resolved,
	location,
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

	if (typeof location !== "undefined") {
		provider.location.setValue(location);
	}

	return html`<element-entrypoint></element-entrypoint>`;
};

export const csr = () => {
	hydrate(entrypointTemplate({ io: csrIo }), document.body);
};
