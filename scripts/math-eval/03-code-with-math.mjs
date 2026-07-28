#!/usr/bin/env node
// Prompts that require BOTH code fences AND math outside. We want to see:
// (a) do models correctly separate them?
// (b) does the normalizer break code content that happens to contain \( or \[?
import { analyze, callModel, normalize, saveRun } from "./lib.mjs";

const MODELS = ["claude-sonnet", "chatgpt-mini", "gemini-pro"];

const PROMPTS = [
	{
		id: "latex-source-teaching",
		text: "how do i write a fraction in LaTeX. show me the syntax and what it renders to",
	},
	{
		id: "python-math-formula",
		text: "write a python function to compute quadratic roots, then show the math formula it implements",
	},
	{
		id: "bash-plus-math",
		text: "give me a bash one-liner to average numbers from a file, and explain the math",
	},
	{
		id: "regex-with-math",
		text: "give me a regex to match currency like $100 or $1,000.99, and show me how it matches these examples",
	},
	{
		id: "sql-plus-math",
		text: "write a sql query for standard deviation of a column, then show the math it's computing",
	},
	{
		id: "algo-and-bigo",
		text: "write pseudocode for binary search and give me its big-O complexity",
	},
	{
		id: "latex-tutorial",
		text: "teach me the basics of LaTeX math syntax with 5 example expressions",
	},
	{
		id: "physics-code",
		text: "write javascript to compute kinetic energy given mass and velocity, then explain the formula",
	},
];

async function main() {
	console.log(`\nCode-with-math test — ${MODELS.length} models × ${PROMPTS.length} prompts\n`);

	for (const model of MODELS) {
		console.log(`▓ ${model}`);
		for (const prompt of PROMPTS) {
			try {
				const { text, analysis } = await callModel(model, prompt.text);
				await saveRun(`code/${model}/${prompt.id}.json`, {
					model,
					prompt: prompt.text,
					text,
					analysis,
				});
				// How much math is inside fenced code (would be an app bug if we mis-parsed it)?
				const insideFences = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
				const mathInsideFences =
					(insideFences.match(/\\\(|\\\[|\$\$?/g) ?? []).length;
				const normalized = normalize(text);
				const normalizedAnalysis = analyze(normalized);
				const beforeBackslash = analysis.backslashInline + analysis.backslashBlock;
				const afterBackslash = normalizedAnalysis.backslashInline + normalizedAnalysis.backslashBlock;
				const codeFencesBefore = (text.match(/```[\s\S]*?```/g) ?? []).length;
				const codeFencesAfter = (normalized.match(/```[\s\S]*?```/g) ?? []).length;
				const status = beforeBackslash === 0 ? "✓clean" : afterBackslash === 0 ? "→fixed" : "✗stuck";
				const fenceOK = codeFencesBefore === codeFencesAfter ? "" : " ⚠fenceLoss";
				console.log(
					`  ${status.padEnd(6)} ${prompt.id.padEnd(24)}  fences:${codeFencesBefore} mathInFences:${mathInsideFences} backslash:${beforeBackslash}→${afterBackslash}${fenceOK}`,
				);
			} catch (e) {
				console.log(`  ? ${prompt.id.padEnd(24)}  err: ${e.message.slice(0, 80)}`);
			}
		}
		console.log();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
