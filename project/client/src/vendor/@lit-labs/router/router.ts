/* eslint-disable @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars -- ignored in original code */

/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type { ReactiveControllerHost } from "lit";
import type { RouteConfig } from "./routes";
import { Routes } from "./routes";

/**
 * A root-level router that installs global event listeners to intercept
 * navigation.
 *
 * This class extends Routes so that it can also have a route configuration.
 *
 * There should only be one Router instance on a page, since the Router
 * installs global event listeners on `window` and `document`. Nested
 * routes should be configured with the `Routes` class.
 */
export class Router extends Routes {
	private _origin: string;

	constructor(
		host: ReactiveControllerHost & HTMLElement,
		routes: Array<RouteConfig>,
		options: {
			origin: string;
			status?: ((code: number) => void) | undefined;
		}
	) {
		super(host, routes);
		this._origin = options.origin;
	}

	override hostConnected() {
		super.hostConnected();
		window.addEventListener("click", this._onClick);
		window.addEventListener("popstate", this._onPopState);
	}

	override hostDisconnected() {
		super.hostDisconnected();
		window.removeEventListener("click", this._onClick);
		window.removeEventListener("popstate", this._onPopState);
	}

	private _onClick = (e: MouseEvent) => {
		const isNonNavigationClick =
			e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey;
		if (e.defaultPrevented || isNonNavigationClick) {
			return;
		}

		const anchor = e
			.composedPath()
			.find((n) => (n as HTMLElement).tagName === "A") as
			| HTMLAnchorElement
			| undefined;
		if (
			anchor === undefined ||
			anchor.target !== "" ||
			anchor.hasAttribute("download") ||
			anchor.getAttribute("rel") === "external"
		) {
			return;
		}

		const href = anchor.href;
		if (href === "" || href.startsWith("mailto:")) {
			return;
		}

		const location = window.location;
		if (anchor.origin !== this._origin) {
			return;
		}

		e.preventDefault();
		if (href !== location.href) {
			window.history.pushState({}, "", href);
			this.goto(anchor.pathname);
		}
	};

	private _onPopState = (_e: PopStateEvent) => {
		this.goto(window.location.pathname);
	};
}

/* eslint-enable @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars -- ↑ */
