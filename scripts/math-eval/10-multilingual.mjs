#!/usr/bin/env node
// Do models use different math delimiters based on language? Non-English
// math instruction in schools uses various conventions. Also check if the
// prompt language influences drift rate.
import { analyze, callModel, normalize, saveRun } from "./lib.mjs";

const MODELS = ["claude-sonnet", "chatgpt-mini", "gemini-pro"];

const PROMPTS = [
	{ id: "en-quadratic", text: "help me solve x^2 + 5x + 6 = 0 step by step" },
	{ id: "zh-quadratic", text: "帮我一步一步解 x^2 + 5x + 6 = 0" },
	{ id: "es-quadratic", text: "ayúdame a resolver x^2 + 5x + 6 = 0 paso a paso" },
	{ id: "fr-quadratic", text: "aide-moi à résoudre x^2 + 5x + 6 = 0 étape par étape" },
	{ id: "de-quadratic", text: "hilf mir x^2 + 5x + 6 = 0 Schritt für Schritt zu lösen" },
	{ id: "ja-quadratic", text: "x^2 + 5x + 6 = 0 を段階的に解いてください" },
	{ id: "hi-quadratic", text: "मुझे x^2 + 5x + 6 = 0 को चरण दर चरण हल करने में मदद करें" },
	{ id: "ar-quadratic", text: "ساعدني في حل x^2 + 5x + 6 = 0 خطوة بخطوة" },
	{ id: "en-pyth", text: "quick refresher: what's the pythagorean theorem" },
	{ id: "zh-pyth", text: "快速复习一下：勾股定理是什么" },
	{ id: "fr-pyth", text: "rappel rapide: quel est le théorème de Pythagore" },
	{ id: "ja-pyth", text: "簡単な復習：ピタゴラスの定理とは何ですか" },
];

async function main() {
	console.log(`\nMultilingual test — ${MODELS.length} models × ${PROMPTS.length} prompts\n`);
	for (const model of MODELS) {
		console.log(`▓ ${model}`);
		let drifts = 0;
		let total = 0;
		for (const prompt of PROMPTS) {
			try {
				const { text, analysis } = await callModel(model, prompt.text);
				await saveRun(`multilingual/${model}/${prompt.id}.json`, {
					model,
					prompt: prompt.text,
					text,
					analysis,
				});
				const bs = analysis.backslashInline + analysis.backslashBlock;
				const drifted = bs > 0;
				total++;
				if (drifted) drifts++;
				const nAfter = analyze(normalize(text));
				const afterBs = nAfter.backslashInline + nAfter.backslashBlock;
				console.log(
					`  ${drifted ? "✗" : "✓"} ${prompt.id.padEnd(16)}  backslash:${bs}  after normalize:${afterBs}  unicode:${analysis.unicodeMath}  $$:${analysis.doubleDollar}`,
				);
			} catch (e) {
				console.log(`  ? ${prompt.id.padEnd(16)}  err: ${e.message.slice(0, 60)}`);
			}
		}
		console.log(`  → ${drifts}/${total} drift (${Math.round((100 * drifts) / total)}%)\n`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
