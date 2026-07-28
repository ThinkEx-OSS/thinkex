#!/usr/bin/env node
// Test two currency-escape fixes:
//   (A) Nuclear prompt: elevate the escape rule and give a concrete example
//   (B) Renderer fallback: after remark-math parses, unwrap any inline math
//       span whose content is numeric-only (no LaTeX macros, no algebraic
//       letters) — likely accidental currency parsing.
//
// Run the currency-stress prompts under each combination:
//   - baseline (current prompt, no unwrap)
//   - nuclear prompt, no unwrap
//   - current prompt + unwrap heuristic
//   - nuclear prompt + unwrap
import { analyze, callModel, FULL_SOUL_PROMPT, saveRun } from "./lib.mjs";

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
	return [
		...html.matchAll(/<code class="language-math[^"]*">([\s\S]*?)<\/code>/g),
	].map((m) => m[1]);
}

// Heuristic: is this math-span content likely accidental currency parsing?
function isSuspectedCurrency(content) {
	const t = content.trim();
	if (!t) return false;
	// If it contains any LaTeX command → real math
	if (/\\[a-zA-Z]/.test(t)) return false;
	// If it contains algebraic-looking variables (letters that aren't currency codes)
	const stripped = t.replace(/USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|k|M|B/g, "");
	if (/[a-zA-Z]{2,}/.test(stripped)) return false; // has ≥2-letter word besides currency code
	// If it contains a single letter that could be a variable (x, y, n, i, e)
	if (/\b[a-df-zA-DF-Z]\b/.test(stripped)) return false; // single algebraic letter (excluding e for scientific notation)
	// Otherwise numeric-only or number+arithmetic → likely accidental currency
	return /\d/.test(t);
}

async function measureBrokenCurrency(text) {
	const spans = await extractMathSpans(text);
	const suspects = spans.filter(isSuspectedCurrency);
	return { total: spans.length, currencyLike: suspects.length, suspects };
}

// String preprocessor: unwrap inline math spans whose content looks like currency.
// Approach: for each $...$ pair in the raw text (excluding inside fenced code),
// if the content matches the isSuspectedCurrency heuristic, replace the $...$
// with the content prefixed by \$.
function currencyUnwrap(text) {
	const parts = text.split(/(```[\s\S]*?```)/g);
	return parts
		.map((part, i) => {
			if (i % 2 === 1) return part; // fenced code, untouched
			// Also skip $$...$$ blocks — only affect single-$ pairs.
			// Only match unescaped $ pairs. Both delimiters must not be preceded by \.
			return part.replace(/\$\$[\s\S]+?\$\$/g, (m) => m).replace(/(?<!\\)\$([^$\n]{1,80}?)(?<!\\)\$/g, (match, content) => {
				if (isSuspectedCurrency(content)) {
					return `\\$${content}\\$`;
				}
				return match;
			});
		})
		.join("");
}

const CURRENT_PROMPT = FULL_SOUL_PROMPT;

const NUCLEAR_PROMPT = FULL_SOUL_PROMPT.replace(
	'- When writing Markdown with math, use `$...$` for inline math and `$$...$$` on separate lines for block math. Escape literal currency dollar signs as `\\$` so they are not parsed as inline math.',
	`- When writing Markdown with math, use \`$...$\` for inline math and \`$$...$$\` on separate lines for block math.
- CRITICAL: Every literal dollar sign in your response — every price, amount, or currency figure — MUST be escaped as \`\\$\`. Write \`\\$5\`, not \`$5\`. Write \`\\$1,000 - \\$200 = \\$800\`, not \`$1,000 - $200 = $800\`. If you forget even one, the price will render as broken math on screen.`,
);

const PROMPTS = [
	{ id: "arithmetic-prose", text: "i bought stuff for $12.50 + $8.75 + $23.99 whats my total" },
	{ id: "discount", text: "if a $200 jacket is 30% off, what's the sale price and how much did i save" },
	{ id: "tax-tip", text: "$45 dinner with 8% tax and 20% tip, whats the total" },
	{ id: "range", text: "recommend me some laptops between $800 and $1500 for coding" },
	{ id: "unit-price", text: "which is cheaper: 5 for $12 or 3 for $8" },
	{ id: "sub-dollar", text: "would a $0.99 vs $1.99 vs $2.99 price point make a difference for my app" },
	{ id: "salary-math", text: "if i make $85k salary plus $15k bonus, what's my monthly gross" },
	{ id: "money-math-mix", text: "i saved $1000 over 6 months. what is my monthly saving rate as a percentage of my $4500 monthly income" },
	{ id: "annuity", text: "if i deposit $500/month at 5% APR for 10 years, whats the future value" },
	{ id: "large-amount", text: "if my mortgage is $450,000 at 6.5% for 30 years, what's the monthly payment" },
];

const MODELS = ["chatgpt-mini", "claude-haiku"];
const N = 2; // 2 runs per cell to smooth noise

async function main() {
	console.log(`\nCurrency escape fix eval — ${MODELS.length} models × ${PROMPTS.length} prompts × ${N} runs\n`);

	for (const model of MODELS) {
		console.log(`▓ ${model}\n`);
		const results = {
			baseline: { broken: 0, brokenAfterUnwrap: 0, total: 0 },
			nuclear: { broken: 0, brokenAfterUnwrap: 0, total: 0 },
		};

		for (const prompt of PROMPTS) {
			for (let i = 0; i < N; i++) {
				for (const [variant, systemPrompt] of [
					["baseline", CURRENT_PROMPT],
					["nuclear", NUCLEAR_PROMPT],
				]) {
					try {
						const { text } = await callModel(model, prompt.text, systemPrompt);
						await saveRun(`currency-fix/${model}/${variant}/${prompt.id}-${i}.json`, {
							model,
							variant,
							prompt: prompt.text,
							text,
						});
						const before = await measureBrokenCurrency(text);
						const unwrapped = currencyUnwrap(text);
						const after = await measureBrokenCurrency(unwrapped);
						results[variant].total++;
						if (before.currencyLike > 0) results[variant].broken++;
						if (after.currencyLike > 0) results[variant].brokenAfterUnwrap++;
					} catch (e) {
						console.log(`  ${variant} ${prompt.id}-${i}: err ${e.message.slice(0, 60)}`);
					}
				}
			}
		}

		for (const v of ["baseline", "nuclear"]) {
			const r = results[v];
			console.log(
				`  ${v.padEnd(10)}  broken:${String(r.broken).padStart(2)}/${String(r.total).padStart(2)} (${Math.round(
					(100 * r.broken) / r.total,
				)}%)  after unwrap:${String(r.brokenAfterUnwrap).padStart(2)}/${r.total} (${Math.round((100 * r.brokenAfterUnwrap) / r.total)}%)`,
			);
		}
		console.log();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
