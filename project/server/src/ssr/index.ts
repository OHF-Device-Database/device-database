import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Readable } from "node:stream";

import { serveStatic } from "@hono/node-server/serve-static";
import { html, render } from "@lit-labs/ssr";
import { installWindowOnGlobal } from "@lit-labs/ssr/lib/dom-shim";
import { collectResult } from "@lit-labs/ssr/lib/render-result";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable.js";
import type { Hono } from "hono";
import { stream } from "hono/streaming";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import serialize from "serialize-javascript";

import { logger as parentLogger } from "../logger";
import { CSSStyleSheet } from "./vendor/@lit-labs/ssr-dom-shim/css";

import type { HandlerMap } from "../api/dependency";

installWindowOnGlobal();

// biome-ignore-start lint/suspicious/noExplicitAny: https://github.com/lit/lit.dev/pull/1390
(globalThis as any).litSsrCallConnectedCallback = true;
(globalThis as any).CSSStyleSheet = CSSStyleSheet;
// biome-ignore-end lint/suspicious/noExplicitAny: ↑

const csrPath = join(import.meta.dirname, "..", "client-csr");
const ssrPath = join(import.meta.dirname, "..", "client-ssr");

const { entrypointTemplate } = await import(join(ssrPath, "entrypoint.mjs"));

const logger = parentLogger.child({ label: "ssr" });

type Resources = {
  "entrypoint-js": string;
};

// manually copied from `client`
type RequestBody<C, B> = {
  contentType: C;
  body: B;
};
type RequestContentType = "text/plain" | "application/json";
type BuiltOperation = {
  name: string;
  path: string;
  method: string;
  parameters: {
    query: Record<string, string>;
    path: Record<string, string>;
    header: Record<string, string>;
  };
  body?: RequestBody<RequestContentType, unknown>;
};

type EntrypointTemplateContext = {
  io: (built: BuiltOperation, signal?: AbortSignal) => Promise<unknown>;
  resolve?: (locationToken: string, task: () => Promise<unknown>) => void;
  resolved?: Record<string, unknown>;
};

const template = (resources: Resources, context: EntrypointTemplateContext) =>
  html`<!DOCTYPE html>
    <html>
      <head></head>
      <body>
        <style>
          html,
          body {
            margin: 0;
            height: 100%;
          }
        </style>
        ${unsafeHTML(`
           <script src="${resources["entrypoint-js"]}" type="module"></script>
       `)} ${typeof context.resolved !== "undefined"
          ? unsafeHTML(`
           <script>var RESOLVED = ${serialize(context.resolved, { isJSON: true })}</script>
       `)
          : ""}
        ${unsafeHTML(`
           <script type="module">
           import { csr } from "${resources["entrypoint-js"]}";
           csr();
           </script>
       `)} ${entrypointTemplate(context)}
      </body>
    </html>`;

const buildIo =
  (handlers: HandlerMap) =>
  async <T>(built: BuiltOperation): Promise<T | undefined> => {
    const { path, method, parameters, body } = built;

    const handler = handlers[path][method] as (
      parameters: unknown,
      requestBody: unknown,
    ) => Promise<unknown>;

    const requestId = randomUUID();

    logger.debug("processing ssr io", {
      requestId,
      path,
      method,
    });

    try {
      return (await handler(parameters, body?.body)) as T;
    } catch (e) {
      logger.error("ssr io error", { requestId });
      throw e;
    } finally {
      logger.debug("processed ssr io", { requestId });
    }
  };

export const build = async (app: Hono, handlers: HandlerMap) => {
  const staticPath = "/static/*";
  const staticPathLength = staticPath.length;

  app.use(
    staticPath,
    serveStatic({
      // `serveStatic` expects relative paths
      root: relative(".", csrPath),
      rewriteRequestPath: (path) => {
        // mountpoint also includes the `/*` portion
        return path.slice(staticPathLength - 2);
      },
    }),
  );

  const csrEntrypointPath = join(csrPath, "entrypoint.js");
  const csrEntrypoint = await readFile(csrEntrypointPath, "utf8");

  let csrEntrypointHash;
  {
    const hash = createHash("sha256");
    hash.update(csrEntrypoint);

    csrEntrypointHash = hash.digest("hex");
  }

  // for cache-busting
  const csrEntrypointAliasPath = `/static/entrypoint-${csrEntrypointHash.slice(0, 8)}.js`;

  app.get(csrEntrypointAliasPath, (c) => {
    c.header("Content-Type", "text/javascript");
    return c.body(csrEntrypoint);
  });

  // `serveStatic` calls `next` when a path isn't found → register handler on same path that returns 404
  app.get(staticPath, (c) => {
    return c.notFound();
  });

  app.get("/*", async (c) => {
    const resources: Resources = { "entrypoint-js": csrEntrypointAliasPath };

    const resolving: Map<string, () => Promise<unknown>> = new Map();

    let settled: PromiseSettledResult<readonly [string, unknown]>[];
    // first render to receive dispatches
    {
      const result = render(
        template(resources, {
          io: buildIo(handlers),
          resolve: (token, bound) => {
            resolving.set(token, bound);
          },
        }),
      );
      await collectResult(result);
      settled = await Promise.allSettled(
        resolving
          .entries()
          .map(([token, bound]) =>
            (async () => [token, await bound()] as const)(),
          ),
      );
    }

    return stream(
      c,
      async (stream) => {
        const resolved = Object.fromEntries(
          settled.flatMap((item) =>
            item.status === "fulfilled" ? [item.value] : [],
          ),
        );

        let rendered;
        try {
          rendered = render(
            template(resources, {
              io: buildIo(handlers),
              resolved,
            }),
          );
        } catch (e) {
          c.text("error");
          c.status(500);
          console.error(e);
          return;
        }

        c.header("Content-Type", "text/html");

        const readable = new RenderResultReadable(rendered);
        await stream.pipe(Readable.toWeb(readable));
      },
      async (err, stream) => {
        stream.writeln("An error occurred!");
        console.error(err);
      },
    );
  });
};
