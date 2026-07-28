#!/usr/bin/env node
// Feed each delimiter dialect through remark-math + rehype-katex directly to
// catalog exactly what Streamdown's rendering pipeline does with each. This
// tells us definitively what Streamdown will and will not render.
// pnpm stores these under .pnpm/*; import via absolute paths so we don't
// need to add them as project deps just for this eval.
const PNPM = "/Users/urjitc/Desktop/thinkex/web/node_modules/.pnpm";
const { unified } = await import(`${PNPM}/unified@11.0.5/node_modules/unified/index.js`);
const remarkParse = (await import(`${PNPM}/remark-parse@11.0.0/node_modules/remark-parse/index.js`)).default;
const remarkGfm = (await import(`${PNPM}/remark-gfm@4.0.1/node_modules/remark-gfm/index.js`)).default;
const remarkMath = (await import(`${PNPM}/remark-math@6.0.0/node_modules/remark-math/index.js`)).default;
const remarkRehype = (await import(`${PNPM}/remark-rehype@11.1.2/node_modules/remark-rehype/index.js`)).default;
const rehypeKatex = (await import(`${PNPM}/rehype-katex@7.0.1/node_modules/rehype-katex/index.js`)).default;
const rehypeStringify = (await import(`${PNPM}/rehype-stringify@10.0.1/node_modules/rehype-stringify/index.js`)).default;

async function render(markdown, opts = { singleDollarTextMath: true }) {
	const errors = [];
	try {
		const file = await unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkMath, { singleDollarTextMath: opts.singleDollarTextMath })
			.use(remarkRehype)
			.use(rehypeKatex, {
				throwOnError: false,
				errorColor: "#cc0000",
				strict: (errorCode, msg) => {
					errors.push(`${errorCode}: ${msg}`);
					return "ignore";
				},
			})
			.use(rehypeStringify)
			.process(markdown);
		return { html: String(file), errors };
	} catch (e) {
		return { html: "", errors: [String(e)] };
	}
}

function classify(html, source) {
	if (html.includes('class="math')) return "MATH-RENDERED";
	if (html.includes(source.replace(/[<>&"'/]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#x27;", "/": "&#x2F;" })[c])))
		return "LITERAL-PASSTHROUGH";
	return "OTHER";
}

const TESTS = [
	{ id: "dollar-inline", md: "The formula is $x^2 + y^2 = z^2$ here." },
	{ id: "dollar-block", md: "Formula:\n\n$$\nE = mc^2\n$$\n\nDone." },
	{ id: "backslash-inline", md: "The formula is \\(x^2 + y^2 = z^2\\) here." },
	{ id: "backslash-block", md: "Formula:\n\n\\[\nE = mc^2\n\\]\n\nDone." },
	{ id: "fenced-math", md: "Formula:\n\n```math\nE = mc^2\n```\n\nDone." },
	{ id: "unicode-math", md: "The set is x ∈ ℝ and ∑ x_i for i ∈ N." },
	{ id: "matrix-block", md: "$$\n\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\n$$" },
	{ id: "matrix-backslash", md: "\\[\n\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\n\\]" },
	{ id: "aligned-block", md: "$$\n\\begin{aligned}\nx &= 1 \\\\ y &= 2\n\\end{aligned}\n$$" },
	{ id: "aligned-backslash", md: "\\[\n\\begin{aligned}\nx &= 1 \\\\ y &= 2\n\\end{aligned}\n\\]" },
	{ id: "escaped-currency", md: "The item costs \\$5.99 today." },
	{ id: "raw-currency-single-dollar", md: "The item costs $5.99 today, or $10 tomorrow." },
	{ id: "bash-vars", md: "Use `$PATH` and `$HOME` in your script." },
	{ id: "bash-vars-not-fenced", md: "Use $PATH and $HOME in your script." },
	{ id: "math-in-code", md: "Here's the source: `\\(x^2\\)` renders as $x^2$." },
	{ id: "math-in-fenced-code", md: "```latex\n\\(x^2 + y^2 = z^2\\)\n\\[E = mc^2\\]\n```\n\nAnd inline $x^2$." },
	{ id: "mixed-dollar-backslash", md: "Inline $x$ and also \\(y\\) — do both work?" },
];

async function main() {
	console.log(`\nRenderer probe — what remark-math + rehype-katex actually parses\n`);
	console.log(`(streamdown uses these exact plugins with singleDollarTextMath: true)\n`);
	for (const t of TESTS) {
		const { html, errors } = await render(t.md);
		const rendered = html.includes("katex") || html.includes('class="math');
		const status = rendered ? "✓ RENDERED" : "✗ passthrough";
		console.log(`  ${status}  ${t.id.padEnd(28)}  ${errors.length ? `[${errors.length} katex warnings]` : ""}`);
	}
	console.log(`\n─ singleDollarTextMath: false (Vercel default) ─\n`);
	for (const t of TESTS) {
		const { html, errors } = await render(t.md, { singleDollarTextMath: false });
		const rendered = html.includes("katex") || html.includes('class="math');
		const status = rendered ? "✓ RENDERED" : "✗ passthrough";
		console.log(`  ${status}  ${t.id.padEnd(28)}  ${errors.length ? `[${errors.length} katex warnings]` : ""}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
