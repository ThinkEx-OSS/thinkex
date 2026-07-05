/*
 * Regenerates the metric-matched "Geist Variable Fallback" @font-face in
 * src/styles.css. Run this only when the Geist font is updated. The Capsize
 * packages are intentionally NOT permanent dependencies (this runs ~once per
 * font bump), so install them on demand first:
 *
 *   pnpm add -D @capsizecss/core @capsizecss/metrics @capsizecss/unpack
 *   node scripts/gen-geist-fallback.mjs
 *   pnpm remove @capsizecss/core @capsizecss/metrics @capsizecss/unpack
 *
 * Then paste the printed @font-face descriptors into src/styles.css.
 */
import { fromBuffer } from "@capsizecss/unpack";
import { createFontStack } from "@capsizecss/core";
import arial from "@capsizecss/metrics/arial";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const woff2 = resolve(
	here,
	"../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
);

const geist = await fromBuffer(await readFile(woff2));

const { fontFaces } = createFontStack([
	{
		familyName: "Geist Variable",
		category: geist.category,
		capHeight: geist.capHeight,
		ascent: geist.ascent,
		descent: geist.descent,
		lineGap: geist.lineGap,
		unitsPerEm: geist.unitsPerEm,
		xHeight: geist.xHeight,
		xWidthAvg: geist.xWidthAvg,
	},
	arial,
]);

console.log("--- Geist metrics ---");
console.log(
	JSON.stringify(
		{
			ascent: geist.ascent,
			descent: geist.descent,
			lineGap: geist.lineGap,
			unitsPerEm: geist.unitsPerEm,
			xWidthAvg: geist.xWidthAvg,
		},
		null,
		2,
	),
);
console.log("--- fallback @font-face ---");
console.log(fontFaces);
