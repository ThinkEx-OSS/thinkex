/*
 * Copies the browser builds of the widget libraries into public/ so sandboxed
 * widget iframes can load them.
 *
 * Widgets run in an opaque-origin iframe under a strict CSP with no network
 * access, so they cannot pull anything from a CDN — the assets have to be
 * served from this app's own origin. Each build is copied verbatim rather than
 * passed through the bundler, so relative asset references (KaTeX fonts, uPlot
 * styles) keep working.
 *
 * Runs from `prepare`, which keeps the copies in lockstep with the installed
 * versions. The output is generated, not committed.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const widgetLibsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "widget-libs");

// Each entry names a library, the directory its browser build sits in, and the
// files to copy from there. All three are CSP-safe: none use eval or
// new Function, so the frame needs no script-src 'unsafe-eval'.
const libraries = [
	{
		name: "katex",
		from: dirname(require.resolve("katex/dist/katex.min.js")),
		// Chemistry (\ce) and units (\pu), matching what chat and documents import.
		entries: ["katex.min.css", "katex.min.js", "fonts", "contrib/mhchem.min.js"],
	},
	{
		// mathjs parses and evaluates the expressions a graphing widget plots.
		name: "mathjs",
		from: dirname(require.resolve("mathjs/lib/browser/math.js")),
		entries: ["math.js", "math.js.LICENSE.txt"],
	},
	{
		// uPlot draws the axes, grid, and lines a graphing widget would otherwise
		// hand-roll in SVG.
		name: "uplot",
		from: dirname(require.resolve("uplot/dist/uPlot.iife.min.js")),
		entries: ["uPlot.iife.min.js", "uPlot.min.css"],
	},
];

for (const library of libraries) {
	const outDir = join(widgetLibsDir, library.name);
	await rm(outDir, { recursive: true, force: true });
	await mkdir(outDir, { recursive: true });

	for (const entry of library.entries) {
		await cp(join(library.from, entry), join(outDir, entry), { recursive: true });
	}

	console.log(`Copied ${library.name} browser build to ${outDir}`);
}
