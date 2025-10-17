// biome-ignore lint/style/useNodejsImportProtocol: prefixing with `node:` doesn't work in vm module context
import { dirname, join } from "path";

import { html, render } from "@lit-labs/ssr";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { isNone } from "../type/maybe";

let __filename: string;
{
	const metaUrl = import.meta.url;
	// url is postfixed with line number for some reason
	const metaUrlRegex = /^(?<path>.*):\d+$/;

	const match = metaUrl.match(metaUrlRegex);
	if (isNone(match)) {
		console.error(`encountered invalid import path <${metaUrl}>`);
		process.exit(1);
	}

	// biome-ignore lint/style/noNonNullAssertion: asserted above
	__filename = match?.groups?.path!;
}

// `import.meta.dirname` is undefined in vm module context
const __dirname = dirname(__filename);

const client = join(__dirname, "..", "client-ssr");

const { entrypointTemplate } = await import(join(client, "entrypoint.mjs"));

type Resources = {
	"entrypoint-js": string;
};

export const entrypoint = (resources: Resources) => {
	const template = html`<!DOCTYPE html>
  <html>
    <head></head>
    <body>
        <style>html, body { margin: 0; height: 100%; }</style>
        ${unsafeHTML(`
            <script src="${resources["entrypoint-js"]}" type="module"></script>
        `)}
        ${unsafeHTML(`
            <script type="module">
            import { csr } from "${resources["entrypoint-js"]}";
            csr();
            </script>
        `)}

        ${entrypointTemplate()}
    </body>
  </html>`;

	// TODO: `renderThunked` is supposedly faster, but types for it aren't exported right now
	return render(template);
};
