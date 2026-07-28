#!/usr/bin/env node
// For every saved run, simulate mid-stream states by truncating at 10, 25,
// 50, 75, 90, 100%. Run each through remark-math with singleDollarTextMath
// AND with Streamdown's parseIncompleteMarkdown-style closing-$ injection.
//
// We're hunting for:
//   (a) intermediate states where currency accidentally renders as math
//       because Streamdown's parser auto-added a closing $ to an unclosed $
//   (b) unicode symbols mid-stream that flicker as raw text
//   (c) any state where math was rendered mid-stream but disappeared in the
//       final render (or vice versa)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { RUNS_DIR } from "./lib.mjs";

const PNPM = "/Users/urjitc/Desktop/thinkex/web/node_modules/.pnpm";
const { unified } = await import(`${PNPM}/unified@11.0.5/node_modules/unified/index.js`);
const remarkParse = (await import(`${PNPM}/remark-parse@11.0.0/node_modules/remark-parse/index.js`)).default;
const remarkGfm = (await import(`${PNPM}/remark-gfm@4.0.1/node_modules/remark-gfm/index.js`)).default;
const remarkMath = (await import(`${PNPM}/remark-math@6.0.0/node_modules/remark-math/index.js`)).default;
const remarkRehype = (await import(`${PNPM}/remark-rehype@11.1.2/node_modules/remark-rehype/index.js`)).default;
const rehypeKatex = (await import(`${PNPM}/rehype-katex@7.0.1/node_modules/rehype-katex/index.js`)).default;
const rehypeStringify = (await import(`${PNPM}/rehype-stringify@10.0.1/node_modules/rehype-stringify/index.js`)).default;

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkMath, { singleDollarTextMath: true })
	.use(remarkRehype)
	.use(rehypeKatex, { throwOnError: false, strict: () => "ignore" })
	.use(rehypeStringify);

// Streamdown's actual parseIncompleteMarkdown attempts to close unmatched
// delimiters mid-stream. We approximate by appending a $ if there's an
// odd count of unescaped $ signs in the current buffer.
function completeIncomplete(text) {
	const dollars = (text.match(/(?<!\\)\$/g) ?? []).length;
	if (dollars % 2 === 1) return text + "$";
	return text;
}

async function render(text) {
	const file = await processor.process(text);
	return String(file);
}

function countKatex(html) {
	return (html.match(/class="katex/g) ?? []).length;
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
	console.log(`\nStreaming simulation over ${files.length} saved responses\n`);

	let currencyFlicker = 0;
	let midstreamMathCount = 0;
	const suspects = [];
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const text = raw.text;
		// Track math count at each truncation point (with incomplete-completion).
		const cuts = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
		const finalHtml = await render(text);
		const finalCount = countKatex(finalHtml);
		let priorHasCurrencyMathRender = false;
		for (const c of cuts) {
			const slice = text.slice(0, Math.floor(text.length * c));
			const patched = completeIncomplete(slice);
			const html = await render(patched);
			// Currency flicker heuristic: this cut's html has a katex span whose
			// text looks like money (starts with digits and comma or decimal), and
			// the final render does not have equivalent span. Approximated cheaply.
			const spans = [...html.matchAll(/<span class="katex[^"]*">.*?<\/span>/g)].map((m) => m[0]);
			for (const s of spans) {
				const inner = s.replace(/<[^>]+>/g, "");
				if (/^\d[\d,\.]{2,}/.test(inner) && !finalHtml.includes(inner)) {
					priorHasCurrencyMathRender = true;
				}
			}
		}
		if (priorHasCurrencyMathRender) {
			currencyFlicker++;
			suspects.push(f);
		}
	}
	console.log(`responses where mid-stream would flash currency as math: ${currencyFlicker} / ${files.length}`);
	if (suspects.length > 0 && suspects.length < 15) {
		console.log("\nSuspects:");
		for (const s of suspects) console.log(`  ${s}`);
	} else if (suspects.length >= 15) {
		console.log(`\nFirst 15 suspects:`);
		for (const s of suspects.slice(0, 15)) console.log(`  ${s}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
