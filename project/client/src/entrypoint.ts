// https://lit.dev/docs/ssr/client-usage/#loading-@lit-labsssr-clientlit-element-hydrate-support.js
// if not imported before _anything_ else, stuff is rendered twice during hydration 🫣
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";

import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { hydrate } from "@lit-labs/ssr-client";
import { ContextProvider } from "@lit/context";

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
import { ContextRouter } from "./context/router";

import "./page/home";
import "./page/device";
import "./page/search";

const routes = [
	{
		path: "/",
		render: () => html`<element-page-home></element-page-home>`,
	},
	{
		// router can't match query parameters → push into element
		path: "/search",
		render: () => html`<element-page-search></element-page-search>`,
	},
	{
		path: "/device/:id",
		render: ({ id }) =>
			html`<element-page-device device-id=${id}></element-page-device>`,
	},
] as const satisfies RouteConfig[];

type SsrLocation = {
	origin: string;
	pathname: string;
	searchParams: URLSearchParams;
	status?: (code: number) => void;
};

@customElement("element-entrypoint")
export class Entrypoint extends LitElement {
	private _router: Router | undefined;

	private _contextProviderRouter = new ContextProvider(this, {
		context: ContextRouter,
	});

	private ssrLocation?: SsrLocation;

	override connectedCallback(): void {
		super.connectedCallback();

		if (typeof this._router !== "undefined") {
			return;
		}

		const router = new Router(this, routes, {
			origin:
				this.ssrLocation?.origin ??
				(window.location.origin ||
					window.location.protocol + "//" + window.location.host),
			location: this.ssrLocation,
		});
		this._contextProviderRouter.setValue(router);
		this._router = router;

		try {
			router.initialGoto(this.ssrLocation?.pathname ?? location.pathname);
		} catch (e) {
			if (e instanceof RouterPathNotFoundError) {
				this.ssrLocation?.status?.(404);
			} else {
				throw e;
			}
		}
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

	return html`<element-entrypoint
		.ssrLocation=${location}
	></element-entrypoint>`;
};

export const csr = () => {
	hydrate(entrypointTemplate({ io: csrIo }), document.body);
};
