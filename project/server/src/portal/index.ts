import { join } from "node:path";

const __dirname = import.meta.dirname;

// everything matching the glob `src/portal/**/static/*` is copied over during build
export const portalPath = (portal: string) => join(__dirname, "portal", portal);
