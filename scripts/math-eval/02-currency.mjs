#!/usr/bin/env node
// 20 currency phrasings x all 3 model families to find breakage points.
// Success = model emits either escaped \$X or raw $X that our regex does NOT
// mistake for math. Failure = we get $foo$ math wrapping over currency amounts,
// which would render as broken math.
import { analyze, callModel, saveRun } from "./lib.mjs";

const MODELS = ["claude-haiku", "chatgpt-mini", "gemini"];

const PROMPTS = [
	{ id: "basic-price", text: "how much is a $5 latte plus tax at 8%" },
	{ id: "large-amount", text: "if my mortgage is $450,000 at 6.5% for 30 years, what's the monthly payment" },
	{ id: "range", text: "recommend me some laptops between $800 and $1500 for coding" },
	{ id: "sub-dollar", text: "would a $0.99 vs $1.99 vs $2.99 price point make a difference for my app" },
	{ id: "million-notation", text: "if a startup raises $5M at a $50M valuation, what percent did they give up" },
	{ id: "salary-math", text: "if i make $85k salary plus $15k bonus, what's my monthly gross" },
	{ id: "arithmetic-prose", text: "i bought stuff for $12.50 + $8.75 + $23.99 whats my total" },
	{ id: "discount", text: "if a $200 jacket is 30% off, what's the sale price and how much did i save" },
	{ id: "tax-tip", text: "$45 dinner with 8% tax and 20% tip, whats the total" },
	{ id: "unit-price", text: "which is cheaper: 5 for $12 or 3 for $8" },
	{ id: "currency-mix", text: "$100 USD is roughly how much in EUR at 0.92 exchange rate" },
	{ id: "no-currency", text: "just explain what a mortgage is in one paragraph" },
	{ id: "escaped-dollar-request", text: "make me a landing page pitch for a saas at $29/month" },
	{ id: "bash-variable", text: "how do i use $HOME and $PATH in a bash script" },
	{ id: "jquery", text: "how do i use $ in jquery to select an element by id" },
	{ id: "regex-anchors", text: "explain ^ and $ in regex" },
	{ id: "python-fstring", text: "how do i use f-strings in python to format a number as currency like $1,234.56" },
	{ id: "money-math-mix", text: "i saved $1000 over 6 months. what is my monthly saving rate as a percentage of my $4500 monthly income" },
	{ id: "kpi", text: "if MRR grew from $10k to $18k in 3 months, whats the monthly growth rate" },
	{ id: "annuity", text: "if i deposit $500/month at 5% APR for 10 years, whats the future value" },
];

function classifyCurrency(analysis, text) {
	// A currency prompt is "broken" if we detect raw currency that landed
	// inside single-dollar math pairs. We approximate by counting whether
	// $-pairs in output enclose money-looking content.
	const dollarMathPairs =
		text.match(/\$[^$\n]{1,60}?\$/g)?.filter((m) => /\d/.test(m) && /,|\.|\/mo|k|M|USD|EUR|month/i.test(m)) ??
		[];
	return {
		likelyBrokenCurrencyMath: dollarMathPairs.length,
		escaped: analysis.escapedCurrency,
		rawOutsideMath: analysis.rawCurrency,
		samples: dollarMathPairs.slice(0, 3),
	};
}

async function main() {
	console.log(`\nCurrency stress test — ${MODELS.length} models × ${PROMPTS.length} prompts\n`);
	for (const model of MODELS) {
		console.log(`▓ ${model}`);
		let breakageTotal = 0;
		for (const prompt of PROMPTS) {
			try {
				const { text, analysis } = await callModel(model, prompt.text);
				await saveRun(`currency/${model}/${prompt.id}.json`, {
					model,
					prompt: prompt.text,
					text,
					analysis,
				});
				const c = classifyCurrency(analysis, text);
				const flag = c.likelyBrokenCurrencyMath > 0 ? "⚠" : "✓";
				if (c.likelyBrokenCurrencyMath > 0) breakageTotal++;
				const sample = c.samples.length ? ` — e.g. ${c.samples[0].slice(0, 40)}` : "";
				console.log(
					`  ${flag} ${prompt.id.padEnd(24)}  esc:${String(c.escaped).padStart(2)} raw:${String(c.rawOutsideMath).padStart(2)} suspectMath:${String(c.likelyBrokenCurrencyMath).padStart(2)}${sample}`,
				);
			} catch (e) {
				console.log(`  ? ${prompt.id.padEnd(24)}  err: ${e.message.slice(0, 80)}`);
			}
		}
		console.log(`  → ${breakageTotal}/${PROMPTS.length} likely-broken currency-in-math renders\n`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
