#!/usr/bin/env node
// Validate the strict normalizer + refined currency-unwrap:
//   1. Drift fix rate against all saved runs (should be 100%)
//   2. Idempotence (should be 100%)
//   3. Fenced code preservation (should be 100%)
//   4. Inline code preservation (test with hand-crafted edge cases)
//   5. Currency unwrap: fixes broken currency AND does NOT unwrap legit math
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze, RUNS_DIR } from "./lib.mjs";
import { currencyUnwrapStrict, isSuspectedBrokenCurrency, normalizeStrict } from "./lib-strict.mjs";

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
	return [...html.matchAll(/<code class="language-math[^"]*">([\s\S]*?)<\/code>/g)].map((m) => m[1]);
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

function fencedContent(text) {
	return [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
}
function inlineCodeContent(text) {
	return [...text.matchAll(/`[^`\n]+`/g)].map((m) => m[0]).join("|");
}

console.log("\n═══ 1. Drift fix rate over 250 saved runs ═══\n");
{
	const files = await walk(RUNS_DIR);
	let hadDrift = 0;
	let fixed = 0;
	let stillDrifting = 0;
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const before = analyze(raw.text);
		const beforeBs = before.backslashInline + before.backslashBlock;
		if (beforeBs === 0) continue;
		hadDrift++;
		const after = analyze(normalizeStrict(raw.text));
		const afterBs = after.backslashInline + after.backslashBlock;
		if (afterBs === 0) fixed++;
		else stillDrifting++;
	}
	console.log(`  drift cases: ${hadDrift}`);
	console.log(`  fully fixed:  ${fixed} (${Math.round((100 * fixed) / hadDrift)}%)`);
	console.log(`  still stuck:  ${stillDrifting}`);
}

console.log("\n═══ 2. Idempotence ═══\n");
{
	const files = await walk(RUNS_DIR);
	let violations = 0;
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const once = normalizeStrict(raw.text);
		const twice = normalizeStrict(once);
		if (once !== twice) violations++;
	}
	console.log(`  normalize(normalize(x)) === normalize(x): ${violations === 0 ? "✓" : `✗ ${violations} violations`}`);
}

console.log("\n═══ 3. Fenced + inline code preservation over 250 saved runs ═══\n");
{
	const files = await walk(RUNS_DIR);
	let fenceBad = 0;
	let inlineBad = 0;
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const normalized = normalizeStrict(raw.text);
		if (fencedContent(raw.text) !== fencedContent(normalized)) fenceBad++;
		if (inlineCodeContent(raw.text) !== inlineCodeContent(normalized)) inlineBad++;
	}
	console.log(`  fenced-code content changed: ${fenceBad}`);
	console.log(`  inline-code content changed: ${inlineBad}`);
}

console.log("\n═══ 4. Inline-code edge cases (hand-crafted) ═══\n");
{
	const cases = [
		["Use `\\(x^2\\)` for inline math.", "Use `\\(x^2\\)` for inline math."],
		["Inline `\\[E=mc^2\\]` here.", "Inline `\\[E=mc^2\\]` here."],
		["Outside: \\(x^2\\). Inside: `\\(y^2\\)`.", "Outside: $x^2$. Inside: `\\(y^2\\)`."],
		["```latex\n\\(x^2\\)\n\\[E=mc^2\\]\n```\n\nAnd \\(y^2\\).", "```latex\n\\(x^2\\)\n\\[E=mc^2\\]\n```\n\nAnd $y^2$."],
	];
	for (const [input, expected] of cases) {
		const got = normalizeStrict(input);
		const ok = got === expected;
		console.log(`  ${ok ? "✓" : "✗"}  ${input.slice(0, 60).replaceAll("\n", "\\n")}`);
		if (!ok) console.log(`      expected: ${expected}\n      got:      ${got}`);
	}
}

console.log("\n═══ 5. Refined currency heuristic — legit math vs broken currency ═══\n");
{
	const cases = [
		// [content, isBrokenCurrency, description]
		["5.99 today, or ", true, "cut off currency phrase"],
		["12.50 + ", true, "arithmetic dangling +"],
		["200 × 0.30 = ", true, "arithmetic dangling ="],
		["1,299–", true, "range dash"],
		["0.99 → ", true, "arrow-transition"],
		[" = 60", true, "leading operator (from $10 = $60)"],
		["3^2 + 4^2 = 25", false, "legit Pythagorean numeric math"],
		["3^2 + 4^2 = 9 + 16 = 25 = 5^2", false, "legit chained math"],
		["x^2 + 5x + 6 = 0", false, "algebra with letters"],
		["\\frac{1}{2}", false, "LaTeX macro"],
		["\\sum_{i=1}^n i", false, "LaTeX sum"],
		["e^{i\\pi} + 1 = 0", false, "Euler identity"],
		["100 USD", false, "currency code (should be caught but ok)"],
		["5", false, "single number — could be either"],
	];
	let pass = 0, fail = 0;
	for (const [content, expected, desc] of cases) {
		const got = isSuspectedBrokenCurrency(content);
		const ok = got === expected;
		if (ok) pass++; else fail++;
		console.log(`  ${ok ? "✓" : "✗"}  expected=${expected} got=${got}  "${content}"  — ${desc}`);
	}
	console.log(`\n  ${pass}/${pass + fail} pass`);
}

console.log("\n═══ 6. Currency-in-math bug audit with strict unwrap ═══\n");
{
	const files = await walk(RUNS_DIR);
	const byExp = new Map();
	function isCurrencyLike(spans) {
		return spans.filter((s) => isSuspectedBrokenCurrency(s)).length;
	}
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const exp = f.split("math-eval-runs/")[1].split("/")[0];
		if (!byExp.has(exp)) byExp.set(exp, { total: 0, brokenBefore: 0, brokenAfter: 0 });
		const g = byExp.get(exp);
		g.total++;
		const spansBefore = await extractMathSpans(normalizeStrict(raw.text));
		if (isCurrencyLike(spansBefore) > 0) g.brokenBefore++;
		const spansAfter = await extractMathSpans(currencyUnwrapStrict(raw.text));
		if (isCurrencyLike(spansAfter) > 0) g.brokenAfter++;
	}
	for (const [exp, g] of byExp) {
		console.log(
			`  ${exp.padEnd(16)}  n=${String(g.total).padStart(3)}  broken:${g.brokenBefore} → after unwrap:${g.brokenAfter}`,
		);
	}
}

console.log("\n═══ 7. Legit-math preservation — count of $-math spans before/after unwrap ═══\n");
// Any drop in count of "safe" math spans is a false positive of the unwrap.
{
	const files = await walk(RUNS_DIR);
	let totalSafe = 0;
	let totalSafeAfter = 0;
	let falsePositive = 0;
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const normalized = normalizeStrict(raw.text);
		const spansBefore = await extractMathSpans(normalized);
		const safeBefore = spansBefore.filter((s) => !isSuspectedBrokenCurrency(s));
		totalSafe += safeBefore.length;
		const unwrapped = currencyUnwrapStrict(raw.text);
		const spansAfter = await extractMathSpans(unwrapped);
		const safeAfter = spansAfter.filter((s) => !isSuspectedBrokenCurrency(s));
		totalSafeAfter += safeAfter.length;
		if (safeBefore.length > safeAfter.length) falsePositive += safeBefore.length - safeAfter.length;
	}
	console.log(`  safe math spans total (pre-unwrap):  ${totalSafe}`);
	console.log(`  safe math spans total (post-unwrap): ${totalSafeAfter}`);
	console.log(`  net legit spans lost (false positives): ${falsePositive}`);
}
