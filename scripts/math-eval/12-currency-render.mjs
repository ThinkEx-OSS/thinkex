#!/usr/bin/env node
// For every saved response, actually run remark-math + rehype-katex over it
// (as Streamdown does) and detect math spans whose contents look like
// currency arithmetic (i.e. accidentally rendered because model forgot \$).
// Also test whether the normalizer fixes this (spoiler: it doesn't).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalize, RUNS_DIR } from "./lib.mjs";

const PNPM = "/Users/urjitc/Desktop/thinkex/web/node_modules/.pnpm";
const { unified } = await import(`${PNPM}/unified@11.0.5/node_modules/unified/index.js`);
const remarkParse = (await import(`${PNPM}/remark-parse@11.0.0/node_modules/remark-parse/index.js`)).default;
const remarkGfm = (await import(`${PNPM}/remark-gfm@4.0.1/node_modules/remark-gfm/index.js`)).default;
const remarkMath = (await import(`${PNPM}/remark-math@6.0.0/node_modules/remark-math/index.js`)).default;
const remarkRehype = (await import(`${PNPM}/remark-rehype@11.1.2/node_modules/remark-rehype/index.js`)).default;
const rehypeStringify = (await import(`${PNPM}/rehype-stringify@10.0.1/node_modules/rehype-stringify/index.js`)).default;

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkMath, { singleDollarTextMath: true })
	.use(remarkRehype)
	.use(rehypeStringify);

async function extractMathSpans(text) {
	const html = String(await processor.process(text));
	// remark-math emits <code class="language-math math-inline">…</code> and pre>code for block
	const spans = [
		...html.matchAll(/<code class="language-math[^"]*">([\s\S]*?)<\/code>/g),
	].map((m) => m[1]);
	return spans;
}

function looksLikeCurrency(content) {
	// Numeric-heavy content with no LaTeX commands and no letters (except k/M/USD/EUR)
	if (/\\[a-zA-Z]/.test(content)) return false; // has LaTeX macro
	if (/\\begin|\\end|\\frac|\\sqrt|\\int|\\sum|\\prod|\\lim/.test(content)) return false;
	// contains letters that aren't currency codes?
	const stripped = content.replace(/USD|EUR|GBP|JPY|k|M/g, "");
	if (/[a-zA-Z]/.test(stripped)) return false; // algebraic variable
	if (/[×÷^]/.test(content)) return true; // arithmetic operator with numbers only → currency arithmetic
	if (/[\d][\.,][\d]/.test(content)) return true; // like 5.99 or 1,000
	if (/^\d[\d\s\.,]*$/.test(content.trim())) return true;
	return false;
}

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(p)));
		else if (entry.name.endsWith(".json")) out.push(p);
	}
	return out;
}

async function main() {
	const files = await walk(RUNS_DIR);
	console.log(`\nCurrency-as-math bug audit — ${files.length} saved responses\n`);
	let byExp = new Map();
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const spans = await extractMathSpans(raw.text);
		const currencyLike = spans.filter(looksLikeCurrency);
		// Try normalize + re-render to see if normalizer changes the picture
		const normalized = normalize(raw.text);
		const spansN = await extractMathSpans(normalized);
		const currencyLikeN = spansN.filter(looksLikeCurrency);
		const exp = f.split("math-eval-runs/")[1].split("/")[0];
		if (!byExp.has(exp)) byExp.set(exp, { total: 0, brokenBefore: 0, brokenAfterNormalize: 0, samples: [] });
		const g = byExp.get(exp);
		g.total++;
		if (currencyLike.length > 0) {
			g.brokenBefore++;
			if (g.samples.length < 3)
				g.samples.push({ file: f.split("/").slice(-2).join("/"), samples: currencyLike.slice(0, 3) });
		}
		if (currencyLikeN.length > 0) g.brokenAfterNormalize++;
	}
	for (const [exp, g] of byExp) {
		console.log(
			`  ${exp.padEnd(14)}  n=${g.total}  broken:${g.brokenBefore} (${Math.round((100 * g.brokenBefore) / g.total)}%)  broken after normalize:${g.brokenAfterNormalize}`,
		);
		for (const s of g.samples) console.log(`    e.g. ${s.file}  → math spans: ${s.samples.slice(0, 2).map((x) => JSON.stringify(x).slice(0, 60)).join(", ")}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
