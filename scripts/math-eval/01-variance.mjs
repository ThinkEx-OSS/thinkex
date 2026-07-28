#!/usr/bin/env node
// N=5 runs per (model × prompt) for the drift-prone models to distinguish
// the real drift rate from single-shot noise.
import { analyze, callModel, fmtDialects, saveRun } from "./lib.mjs";

const MODELS = ["chatgpt", "chatgpt-mini"];
const N = 5;

const PROMPTS = [
	{ id: "quadratic", text: "help me solve x^2 + 5x + 6 = 0 step by step" },
	{ id: "sum-1-to-n", text: "prove that 1+2+...+n = n(n+1)/2" },
	{ id: "two-equations", text: "solve these for me: 2x+3y=12 and x-y=1" },
	{ id: "fractions", text: "why does 1/3 + 1/6 equal 1/2" },
	{ id: "derivative", text: "whats the derivative of x^3 * sin(x)" },
	{ id: "compound-interest", text: "if i invest $10000 at 7% compounded annually, how much do i have after 20 years" },
	{ id: "physics-ke", text: "how much kinetic energy does a 2kg ball moving at 5 m/s have" },
	{ id: "pythag", text: "quick refresher: what's the pythagorean theorem" },
];

async function main() {
	console.log(`\nVariance test — ${MODELS.length} models × ${PROMPTS.length} prompts × ${N} runs\n`);
	for (const model of MODELS) {
		console.log(`▓ ${model}`);
		for (const prompt of PROMPTS) {
			const drifts = [];
			for (let i = 0; i < N; i++) {
				try {
					const { text, analysis } = await callModel(model, prompt.text);
					await saveRun(`variance/${model}/${prompt.id}-${i}.json`, {
						model,
						prompt: prompt.text,
						text,
						analysis,
					});
					const backslash = analysis.backslashInline + analysis.backslashBlock;
					drifts.push(backslash > 0);
				} catch (e) {
					drifts.push(null);
					console.log(`    err ${i}: ${e.message.slice(0, 80)}`);
				}
			}
			const failures = drifts.filter((d) => d === true).length;
			const successes = drifts.filter((d) => d === false).length;
			const bar = drifts.map((d) => (d === null ? "?" : d ? "✗" : "✓")).join("");
			console.log(
				`  ${prompt.id.padEnd(20)}  ${bar}  ${failures}/${successes + failures} drift (${Math.round((100 * failures) / (successes + failures || 1))}%)`,
			);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
