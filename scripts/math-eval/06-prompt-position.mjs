#!/usr/bin/env node
// Does putting the Output Format section at the TOP of the system prompt
// reduce GPT-mini's backslash drift? If yes, cheapest possible fix.
import { analyze, callModel, saveRun } from "./lib.mjs";

const MODEL = "chatgpt-mini";
const N = 3;

const SECTIONS = {
	identity: `# Identity
- You are ThinkEx's workspace assistant.
- Help the user understand, organize, and work in their actual ThinkEx workspace.`,
	format: `# Output Format
- Format final answers as GitHub-flavored Markdown.
- When writing Markdown with math, use \`$...$\` for inline math and \`$$...$$\` on separate lines for block math. Escape literal currency dollar signs as \`\\$\` so they are not parsed as inline math.`,
	response: `# Response Style
- Answer directly first. Be clear, specific, and non-redundant.
- Do not open with praise, flattery, or generic validation.`,
	memory: `# Memory
- Use memory only for durable preferences, workspace goals, thread goals, and decisions.`,
};

const VARIANTS = {
	"format-first": [SECTIONS.format, SECTIONS.identity, SECTIONS.response, SECTIONS.memory].join("\n\n"),
	"format-middle": [SECTIONS.identity, SECTIONS.response, SECTIONS.format, SECTIONS.memory].join("\n\n"),
	"format-last": [SECTIONS.identity, SECTIONS.response, SECTIONS.memory, SECTIONS.format].join("\n\n"),
	"format-only": SECTIONS.format,
};

const PROMPTS = [
	{ id: "quadratic", text: "help me solve x^2 + 5x + 6 = 0 step by step" },
	{ id: "sum-1-to-n", text: "prove that 1+2+...+n = n(n+1)/2" },
	{ id: "two-equations", text: "solve these for me: 2x+3y=12 and x-y=1" },
	{ id: "fractions", text: "why does 1/3 + 1/6 equal 1/2" },
];

async function main() {
	console.log(`\nPrompt-position sensitivity — ${MODEL} × ${PROMPTS.length} prompts × ${N} runs\n`);
	for (const [variant, system] of Object.entries(VARIANTS)) {
		console.log(`▓ ${variant}`);
		let totalRuns = 0;
		let totalDrift = 0;
		for (const prompt of PROMPTS) {
			const results = [];
			for (let i = 0; i < N; i++) {
				try {
					const { text, analysis } = await callModel(MODEL, prompt.text, system);
					await saveRun(`position/${variant}/${prompt.id}-${i}.json`, {
						variant,
						prompt: prompt.text,
						text,
						analysis,
					});
					const bs = analysis.backslashInline + analysis.backslashBlock;
					results.push(bs > 0);
					totalRuns++;
					if (bs > 0) totalDrift++;
				} catch (e) {
					results.push(null);
					console.log(`    err: ${e.message.slice(0, 60)}`);
				}
			}
			const bar = results.map((d) => (d === null ? "?" : d ? "✗" : "✓")).join("");
			console.log(`  ${prompt.id.padEnd(20)}  ${bar}`);
		}
		console.log(`  → drift ${totalDrift}/${totalRuns} (${Math.round((100 * totalDrift) / totalRuns)}%)\n`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
