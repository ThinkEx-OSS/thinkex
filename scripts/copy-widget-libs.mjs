/*
 * Copies KaTeX's browser build into public/ so sandboxed widget iframes can
 * load it.
 *
 * Widgets run in an opaque-origin iframe under a strict CSP with no network
 * access, so they cannot pull anything from a CDN — the assets have to be
 * served from this app's own origin. KaTeX's stylesheet references its fonts
 * relatively (`url(fonts/...)`), so the whole directory is copied verbatim
 * rather than passed through the bundler.
 *
 * Runs from `prepare`, which keeps the copy in lockstep with the installed
 * katex version. The output is generated, not committed.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const katexDist = dirname(require.resolve("katex/dist/katex.min.js"));
const outDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"public",
	"widget-libs",
	"katex",
);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of [
	"katex.min.css",
	"katex.min.js",
	"fonts",
	"contrib/auto-render.min.js",
	// Chemistry (\ce) and units (\pu), matching what chat and documents import.
	"contrib/mhchem.min.js",
]) {
	await cp(join(katexDist, entry), join(outDir, entry), { recursive: true });
}

console.log(`Copied KaTeX browser build to ${outDir}`);
